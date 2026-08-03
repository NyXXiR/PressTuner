import { randomUUID } from "crypto";
import OpenAI from "openai";
import { BrickSource } from "@prisma/client";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import { consumeTeamQuota } from "@/lib/services/usageService";
import {
  createExperienceBrick,
  updateExperienceBrick,
} from "@/lib/services/resume/resumeBrickService";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.PT_BRIEF_MODEL ?? "gpt-4.1-mini";

const ExtractedBrickSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  originalText: z.string().min(1),
  period: z.string().nullable(),
  tags: z.array(z.string()).max(6),
  matchedBrickId: z.string().nullable(),
  reason: z.string().nullable(),
});

const ChatBrickExtractionSchema = z.object({
  shouldIngest: z.boolean(),
  summary: z.string(),
  items: z.array(ExtractedBrickSchema).max(3),
});

type ExistingBrick = {
  id: string;
  title: string;
  content: string;
  originalText: string | null;
  tags: string[];
};

type QuestionBrickLink = {
  isAiSuggested: boolean;
  isSelected: boolean;
  brick: {
    id: string;
    title: string;
    content: string;
    originalText: string | null;
    tags: string[];
  };
};

export type ResumeBrickIngestionPreviewItem = {
  previewId: string;
  mode: "create" | "link" | "augment";
  title: string;
  content: string;
  originalText: string;
  period: string | null;
  tags: string[];
  matchedBrickId: string | null;
  matchedBrickTitle: string | null;
  reason: string | null;
  existingContent: string | null;
  existingOriginalText: string | null;
};

function throwErr(code: string, status: number, message?: string): never {
  throw new ServiceError(code, status, message);
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTokenSet(text: string) {
  return new Set(
    normalizeText(text)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function jaccardScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function findLikelyDuplicateBrick(
  candidate: z.infer<typeof ExtractedBrickSchema>,
  existingBricks: ExistingBrick[],
) {
  const candidateTokens = buildTokenSet(
    `${candidate.title} ${candidate.content} ${candidate.tags.join(" ")}`,
  );

  let bestMatch: ExistingBrick | null = null;
  let bestScore = 0;

  for (const brick of existingBricks) {
    const existingTokens = buildTokenSet(
      `${brick.title} ${brick.content} ${brick.originalText ?? ""} ${brick.tags.join(" ")}`,
    );
    const tokenScore = jaccardScore(candidateTokens, existingTokens);
    const titleA = normalizeText(candidate.title);
    const titleB = normalizeText(brick.title);
    const includesBonus =
      titleA && titleB && (titleA.includes(titleB) || titleB.includes(titleA))
        ? 0.2
        : 0;
    const score = tokenScore + includesBonus;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = brick;
    }
  }

  return bestScore >= 0.58 ? bestMatch : null;
}

function mapQuestionBricks(relatedBricks: QuestionBrickLink[]) {
  return relatedBricks.map((link) => ({
    ...link.brick,
    isAiSuggested: link.isAiSuggested,
    isSelected: link.isSelected,
  }));
}

function hasMeaningfulAddition(
  candidate: z.infer<typeof ExtractedBrickSchema>,
  matchedBrick: ExistingBrick,
) {
  const existingTokens = buildTokenSet(
    `${matchedBrick.content} ${matchedBrick.originalText ?? ""} ${matchedBrick.tags.join(" ")}`,
  );
  const candidateTokens = buildTokenSet(
    `${candidate.content} ${candidate.originalText} ${candidate.tags.join(" ")}`,
  );
  let novelTokenCount = 0;
  for (const token of candidateTokens) {
    if (!existingTokens.has(token)) novelTokenCount += 1;
  }
  return novelTokenCount >= 3;
}

function mergeUniqueText(base: string, addition: string, separator = " ") {
  const normalizedBase = normalizeText(base);
  const normalizedAddition = normalizeText(addition);
  if (!normalizedAddition) return base.trim();
  if (normalizedBase.includes(normalizedAddition)) return base.trim();
  return `${base.trim()}${separator}${addition.trim()}`.trim();
}

function mergeTags(base: string[], addition: string[]) {
  return Array.from(
    new Set([...base, ...addition].map((tag) => tag.trim()).filter(Boolean)),
  ).slice(0, 8);
}

async function loadIngestionContext(input: {
  applicationId: string;
  questionId: string;
  userId: string;
  teamId: string;
}) {
  const { applicationId, questionId, userId, teamId } = input;

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      questions: {
        where: { id: questionId },
        select: {
          id: true,
          questionText: true,
          relatedBricks: {
            where: { brick: { userId } },
            include: {
              brick: true,
            },
          },
        },
      },
    },
  });

  if (!app) {
    throwErr("NOT_FOUND", 404, "Application not found");
  }
  if (app.userId !== userId) {
    throwErr("FORBIDDEN", 403, "Unauthorized");
  }
  if (app.teamId && app.teamId !== teamId) {
    throwErr("FORBIDDEN", 403, "Team access denied");
  }

  const question = app.questions[0];
  if (!question) {
    throwErr("NOT_FOUND", 404, "Question not found");
  }

  const existingBricks = await prisma.experienceBrick.findMany({
    where: {
      userId,
      memoryStatus: "CONFIRMED",
    },
    select: {
      id: true,
      title: true,
      content: true,
      originalText: true,
      tags: true,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return { app, question, existingBricks };
}

function buildPreviewItems(
  parsedItems: z.infer<typeof ExtractedBrickSchema>[],
  existingBricks: ExistingBrick[],
) {
  const previewItems: ResumeBrickIngestionPreviewItem[] = [];
  const seenKeys = new Set<string>();

  for (const item of parsedItems) {
    const matchedByModel =
      item.matchedBrickId != null
        ? existingBricks.find((brick) => brick.id === item.matchedBrickId) ?? null
        : null;
    const matchedBrick =
      matchedByModel ?? findLikelyDuplicateBrick(item, existingBricks);

    if (matchedBrick) {
      const dedupeKey = `link:${matchedBrick.id}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      if (hasMeaningfulAddition(item, matchedBrick)) {
        previewItems.push({
          previewId: randomUUID(),
          mode: "augment",
          title: matchedBrick.title,
          content: mergeUniqueText(matchedBrick.content, item.content),
          originalText: mergeUniqueText(
            matchedBrick.originalText ?? matchedBrick.content,
            item.originalText,
            "\n",
          ),
          period: item.period?.trim() || null,
          tags: mergeTags(matchedBrick.tags, item.tags),
          matchedBrickId: matchedBrick.id,
          matchedBrickTitle: matchedBrick.title,
          reason: item.reason,
          existingContent: matchedBrick.content,
          existingOriginalText: matchedBrick.originalText ?? matchedBrick.content,
        });
        continue;
      }

      previewItems.push({
        previewId: randomUUID(),
        mode: "link",
        title: matchedBrick.title,
        content: matchedBrick.content,
        originalText: matchedBrick.originalText ?? matchedBrick.content,
        period: null,
        tags: matchedBrick.tags,
        matchedBrickId: matchedBrick.id,
        matchedBrickTitle: matchedBrick.title,
        reason: item.reason,
        existingContent: matchedBrick.content,
        existingOriginalText: matchedBrick.originalText ?? matchedBrick.content,
      });
      continue;
    }

    const normalizedTitle = normalizeText(item.title);
    const normalizedContent = normalizeText(item.content);
    const dedupeKey = `create:${normalizedTitle}:${normalizedContent}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    previewItems.push({
      previewId: randomUUID(),
      mode: "create",
      title: item.title.trim(),
      content: item.content.trim(),
      originalText: item.originalText.trim(),
      period: item.period?.trim() || null,
      tags: item.tags.map((tag) => tag.trim()).filter(Boolean),
      matchedBrickId: null,
      matchedBrickTitle: null,
      reason: item.reason,
      existingContent: null,
      existingOriginalText: null,
    });
  }

  return previewItems;
}

export async function previewResumeQuestionBricksFromChat(input: {
  applicationId: string;
  questionId: string;
  userId: string;
  teamId: string;
  prompt: string;
  recentMessages?: Array<{ role: "user" | "assistant"; body: string }>;
}) {
  const { applicationId, questionId, userId, teamId, prompt, recentMessages } = input;
  const { app, question, existingBricks } = await loadIngestionContext({
    applicationId,
    questionId,
    userId,
    teamId,
  });

  const selectedTitles = question.relatedBricks
    .filter((link) => link.isSelected)
    .map((link) => link.brick.title)
    .join(", ");

  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `
You extract resume experience bricks from Korean chat messages.

Goal:
- Decide whether the user just shared a concrete new experience worth storing as a brick.
- If yes, return up to 3 structured bricks.
- If an experience already exists in the provided brick list, set matchedBrickId instead of creating a new one.

Rules:
- Only ingest when the user message contains a concrete experience, project, responsibility, achievement, experiment, internship, club, side project, leadership event, or measurable work story.
- Do not ingest vague requests like "더 좋게 써줘", "브릭 바꿔줘", "첨삭해줘".
- Prefer short, reusable brick summaries.
- content must be a concise 1-2 sentence reusable summary in Korean.
- originalText should preserve the concrete detail from the user's chat in Korean.
- tags should be short nouns/phrases in Korean or English.
- If there is no store-worthy new experience, shouldIngest must be false and items must be empty.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            application: {
              companyName: app.companyName,
              jobTitle: app.jobTitle,
            },
            question: question.questionText,
            currentlySelectedBricks: selectedTitles || "없음",
            recentMessages: recentMessages ?? [],
            prompt,
            existingBricks: existingBricks.map((brick) => ({
              id: brick.id,
              title: brick.title,
              content: brick.content,
              tags: brick.tags,
            })),
          },
          null,
          2,
        ),
      },
    ],
    response_format: zodResponseFormat(
      ChatBrickExtractionSchema,
      "resume_chat_brick_extraction",
    ),
    temperature: 0.1,
  });

  const parsed = completion.choices[0].message.parsed;
  if (!parsed || !parsed.shouldIngest || parsed.items.length === 0) {
    return {
      ok: true,
      previewCount: 0,
      summary: parsed?.summary ?? "새로 편입할 경험 브릭 후보를 찾지 못했습니다.",
      items: [],
      questionBricks: mapQuestionBricks(question.relatedBricks),
    };
  }

  const items = buildPreviewItems(parsed.items, existingBricks);

  return {
    ok: true,
    previewCount: items.length,
    summary: parsed.summary,
    items,
    questionBricks: mapQuestionBricks(question.relatedBricks),
  };
}

export async function applyResumeQuestionBrickPreview(input: {
  applicationId: string;
  questionId: string;
  userId: string;
  teamId: string;
  items: ResumeBrickIngestionPreviewItem[];
}) {
  const { applicationId, questionId, userId, teamId, items } = input;
  const { existingBricks } = await loadIngestionContext({
    applicationId,
    questionId,
    userId,
    teamId,
  });

  if (items.length === 0) {
    const updatedQuestion = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        relatedBricks: {
          include: {
            brick: true,
          },
        },
      },
    });

    return {
      ok: true,
      appliedCount: 0,
      summary: "선택된 경험 브릭이 없어 편입을 건너뛰었습니다.",
      createdBricks: [],
      linkedExistingBricks: [],
      updatedBricks: [],
      pendingCandidates: [],
      pendingReview: false,
      questionBricks:
        updatedQuestion?.relatedBricks.map((link) => ({
          ...link.brick,
          isAiSuggested: link.isAiSuggested,
          isSelected: link.isSelected,
        })) ?? [],
    };
  }

  await consumeTeamQuota({
    teamId,
    userId,
    targetId: questionId,
    type: "RESUME",
    action: "resume_brick_extract",
  });

  const pendingCandidates: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    originalText: string | null;
  }> = [];
  const linkedExistingBricks: ExistingBrick[] = [];
  const selectedBrickIds = new Set<string>();

  for (const item of items) {
    if ((item.mode === "link" || item.mode === "augment") && item.matchedBrickId) {
      const matchedBrick = existingBricks.find(
        (brick) => brick.id === item.matchedBrickId,
      );
      if (!matchedBrick) continue;

      if (item.mode === "augment") {
        const updated = await updateExperienceBrick(matchedBrick.id, userId, {
          title: item.title.trim(),
          content: item.content.trim(),
          originalText: item.originalText.trim(),
          ...(item.period ? { period: item.period.trim() } : {}),
          tags: item.tags.map((tag) => tag.trim()).filter(Boolean),
        });
        pendingCandidates.push({
          id: updated.id,
          title: updated.title,
          content: updated.content,
          tags: updated.tags,
          originalText: updated.originalText,
        });
      } else {
        linkedExistingBricks.push(matchedBrick);
      }

      selectedBrickIds.add(matchedBrick.id);
      continue;
    }

    const created = await createExperienceBrick({
      teamId,
      userId,
      title: item.title.trim(),
      content: item.content.trim(),
      originalText: item.originalText.trim(),
      period: item.period?.trim() || null,
      tags: item.tags.map((tag) => tag.trim()).filter(Boolean),
      source: BrickSource.AI_EXTRACT,
    });

    const createdItem = {
      id: created.id,
      title: created.title,
      content: created.content,
      tags: created.tags,
      originalText: created.originalText,
    };
    pendingCandidates.push(createdItem);
  }

  if (selectedBrickIds.size > 0) {
    await prisma.$transaction(async (tx) => {
      for (const brickId of selectedBrickIds) {
        const existingLink = await tx.questionOnBrick.findUnique({
          where: {
            questionId_brickId: {
              questionId,
              brickId,
            },
          },
        });

        if (existingLink) {
          await tx.questionOnBrick.update({
            where: {
              questionId_brickId: {
                questionId,
                brickId,
              },
            },
            data: {
              isSelected: true,
            },
          });
          continue;
        }

        await tx.questionOnBrick.create({
          data: {
            questionId,
            brickId,
            isSelected: true,
            isAiSuggested: false,
          },
        });
      }
    });
  }

  const updatedQuestion = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      relatedBricks: {
        include: {
          brick: true,
        },
      },
    },
  });

  return {
    ok: true,
    appliedCount: linkedExistingBricks.length,
    summary:
      pendingCandidates.length > 0
        ? `${pendingCandidates.length}개의 경력 기억 후보를 만들었습니다. 경력 기억에서 검토 후 승인해 주세요.`
        : "승인한 기존 경험 브릭을 현재 문항에 반영했습니다.",
    createdBricks: [],
    linkedExistingBricks,
    updatedBricks: [],
    pendingCandidates,
    pendingReview: pendingCandidates.length > 0,
    questionBricks:
      updatedQuestion?.relatedBricks.map((link) => ({
        ...link.brick,
        isAiSuggested: link.isAiSuggested,
        isSelected: link.isSelected,
      })) ?? [],
  };
}
