import OpenAI from "openai";
import {
  buildResumeStrategyPrompt,
  buildResumeSuggestionPrompt,
} from "@/domain/career-memory/careerTrustedGeneration";
import { prisma } from "@/lib/prisma";
import { consumeTeamQuota } from "@/lib/services/usageService";
import { ServiceError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { RESUME_PROMPTS } from "@/lib/llm/prompts/resume";
import { rankBricksForQuestion } from "./resumeRagService";
import { resolveModel } from "@/lib/ai/modelPolicy";
import type {
  QuestionAiMessageKind,
  QuestionAiMessageRole,
} from "@prisma/client";
import {
  buildResumePolishGroundingContext,
  buildResumeRepolishPromptBundle,
  createInitialResumeEditHarness,
  createResumeEditHarnessMeta,
  mergeResumePendingRewriteIntoHarness,
  mergeResumePolishIntoHarness,
  readLatestResumeEditHarness,
  syncResumeEditHarness,
  type ResumeHarnessBrick,
  type ResumeHarnessNote,
} from "./resumeEditHarness";
import { finalizeCareerAnswer } from "./careerFinalizationService";
import { retrieveCareerMemory } from "./careerRetrievalService";
import {
  canonicalizeCareerAnswer,
  hashCareerAnswer,
} from "@/domain/career-memory/answerHash";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = resolveModel("resume.generate");

function throwErr(code: string, status: number, message?: string): never {
  throw new ServiceError(code, status, message);
}

async function getAccessibleQuestion(input: {
  userId: string;
  questionId: string;
}) {
  const question = await prisma.question.findUnique({
    where: { id: input.questionId },
    select: {
      id: true,
      questionText: true,
      answer: true,
      answerRevision: true,
      application: { select: { userId: true, teamId: true } },
    },
  });

  if (!question) {
    throwErr("NOT_FOUND", 404, "Question not found");
  }

  if (question.application.userId !== input.userId) {
    throwErr("FORBIDDEN", 403, "Unauthorized");
  }

  if (question.application.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: question.application.teamId,
          userId: input.userId,
        },
      },
      select: { userId: true },
    });
    if (!membership) {
      throwErr("FORBIDDEN", 403, "Team access denied");
    }
  }

  return question;
}

function logResumeEvent(event: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[RESUME:${event}]`, data);
}

function safeJsonParse(raw: string | null | undefined) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {} as Prisma.InputJsonValue;
  }
}

async function trustedResumeHarnessBricks(input: {
  userId?: string;
  bricks?: any[];
}): Promise<ResumeHarnessBrick[]> {
  if (!input.userId || !Array.isArray(input.bricks)) return [];
  const experienceIds = [
    ...new Set(
      input.bricks
        .map((brick) => (typeof brick?.id === "string" ? brick.id : ""))
        .filter(Boolean),
    ),
  ];
  if (experienceIds.length === 0) return [];
  const facts = await prisma.careerFact.findMany({
    where: {
      userId: input.userId,
      experienceId: { in: experienceIds },
      active: true,
      trustStatus: "TRUSTED",
      experience: { memoryStatus: "CONFIRMED" },
    },
    orderBy: [{ experienceId: "asc" }, { fieldPath: "asc" }],
    select: { experienceId: true, fieldPath: true, value: true },
  });
  const byExperience = new Map<string, Array<{ fieldPath: string; value: string }>>();
  for (const fact of facts) {
    const grouped = byExperience.get(fact.experienceId) ?? [];
    grouped.push(fact);
    byExperience.set(fact.experienceId, grouped);
  }
  return experienceIds.flatMap((id) => {
    const trustedFacts = byExperience.get(id) ?? [];
    return trustedFacts.length > 0
      ? [
          {
            id,
            title: "Trusted career facts",
            content: trustedFacts
              .map((fact) => `${fact.fieldPath}: ${fact.value}`)
              .join("\n"),
          },
        ]
      : [];
  });
}

async function loadResumeEditHarness(input: {
  userId?: string;
  questionId?: string;
  question?: string;
  briefContext?: string;
  bricks?: any[];
  currentAnswer: string;
  syncedAt: string;
}) {
  const normalizedBricks = await trustedResumeHarnessBricks({
    userId: input.userId,
    bricks: input.bricks,
  });

  if (!input.userId || !input.questionId) {
    return createInitialResumeEditHarness({
      question: input.question || "",
      briefContext: input.briefContext,
      bricks: normalizedBricks,
      currentAnswer: input.currentAnswer,
      generatedAt: input.syncedAt,
    });
  }

  const accessibleQuestion = await getAccessibleQuestion({
    userId: input.userId,
    questionId: input.questionId,
  });

  const snapshotMessages = await prisma.questionAiMessage.findMany({
    where: {
      questionId: input.questionId,
      role: "SYSTEM",
      kind: "STATUS",
    },
    orderBy: { createdAt: "asc" },
    select: { meta: true },
  });

  const persistedHarness = readLatestResumeEditHarness(
    snapshotMessages.map((message) => message.meta),
  );

  const baseHarness =
    persistedHarness ??
    createInitialResumeEditHarness({
      question: input.question || accessibleQuestion.questionText,
      briefContext: input.briefContext,
      bricks: normalizedBricks,
      currentAnswer: input.currentAnswer,
      generatedAt: input.syncedAt,
    });

  return syncResumeEditHarness(baseHarness, {
    question: input.question || accessibleQuestion.questionText,
    briefContext: input.briefContext,
    bricks: normalizedBricks,
    currentAnswer: input.currentAnswer,
    syncedAt: input.syncedAt,
  });
}

async function persistResumeEditHarnessSnapshot(input: {
  questionId?: string;
  harness: ReturnType<typeof createInitialResumeEditHarness>;
  content: string;
}) {
  if (!input.questionId) return;

  await prisma.questionAiMessage.create({
    data: {
      questionId: input.questionId,
      role: "SYSTEM",
      kind: "STATUS",
      content: input.content,
      meta: toPrismaJson(createResumeEditHarnessMeta(input.harness)),
    },
  });
}

function findSpansInText(fullText: string, notes: any[]) {
  const spans: any[] = [];
  notes.forEach((item, idx) => {
    if (!item.quote) return;
    const startIndex = fullText.indexOf(item.quote);
    if (startIndex !== -1) {
      spans.push({
        id: `span-${idx}`,
        start: startIndex,
        end: startIndex + item.quote.length,
        note: item.note,
        type: item.type,
      });
    }
  });
  return spans;
}

export async function generateResumeAnswer(input: {
  teamId: string;
  userId: string;
  question: string;
  bricks: any[];
  instruction?: string;
  charLimit?: number;
  briefContext?: string;
}) {
  const { teamId, userId, question, bricks, instruction, charLimit, briefContext } = input;

  if (!question || !bricks || bricks.length === 0) {
    throwErr("BAD_REQUEST", 400, "Missing required fields");
  }
  const trustedBricks = await trustedResumeHarnessBricks({ userId, bricks });
  if (trustedBricks.length === 0) {
    throwErr(
      "CAREER_MEMORY_NOT_TRUSTED",
      422,
      "No trusted career facts are available for the selected experiences",
    );
  }

  logResumeEvent("GENERATE_REQUEST", {
    userId,
    teamId,
    question,
    charLimit,
    bricksCount: bricks?.length ?? 0,
    hasInstruction: !!instruction,
  });

  await consumeTeamQuota({
    teamId,
    userId,
    type: "RESUME",
    action: "resume_generate",
  });

  const experiencesContext = trustedBricks
    .map(
      (b: any, i: number) => `
[Experience ${i + 1}]
- Title: ${b.title}
- Trusted facts: ${b.content}
    `
    )
    .join("\n\n");

  const systemPrompt = fillTemplate(RESUME_PROMPTS.generate.system, {
    charLimit: String(charLimit || 1000),
  });

  const userPrompt = `
**Question:** ${question}

${briefContext ? `**Hiring Brief:**\n${briefContext}\n\n` : ""}

**My Trusted Career Facts:**
${experiencesContext}

**User Specific Instruction:**
${instruction || "Please write a professional draft."}

**Length Requirement:**
The target is ${charLimit || "1000"} Korean characters.
**You MUST write at least ${Math.floor((charLimit || 1000) * 0.85)} characters.**

**Final Action:**
Write the full cover letter answer in Korean. **Be extremely detailed and thorough.** 
Do not be brief. Expand on every action and result to meet the character limit.
`.trim();

  const completion = await openai.chat.completions.create({
    model: resolveModel("resume.generate"),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });

  const generatedText = completion.choices[0].message.content;

  logResumeEvent("GENERATE_DONE", {
    userId,
    teamId,
    outputLength: generatedText?.length ?? 0,
  });

  return { text: generatedText };
}

export async function polishResumeAnswer(input: {
  teamId: string;
  userId?: string;
  questionId?: string;
  text: string;
  question?: string;
  briefContext?: string;
  bricks?: any[];
}) {
  const { teamId, userId, questionId, text, question, briefContext, bricks } =
    input;

  if (!text) {
    throwErr("BAD_REQUEST", 400, "No text provided");
  }

  logResumeEvent("POLISH_REQUEST", {
    teamId,
    textLength: text.length,
  });

  await consumeTeamQuota({
    teamId,
    userId,
    targetId: questionId,
    type: "RESUME",
    action: "resume_polish",
  });

  const polishAt = new Date().toISOString();
  const harness = await loadResumeEditHarness({
    userId,
    questionId,
    question,
    briefContext,
    bricks,
    currentAnswer: text,
    syncedAt: polishAt,
  });

  const messages: any[] = [
    {
      role: "system",
      content: `${RESUME_PROMPTS.polish.system}

[추가 검토 원칙]
- Hiring Brief와 Experience Bricks를 기준으로 답변의 질문 적합성을 검토하라.
- 선택된 경험과 모순되거나 근거가 약한 표현이 있으면 우선 지적하라.
- 답변 밖의 새로운 사실을 전제로 피드백하지 마라.
      `.trim(),
    },
    {
      role: "user",
      content: `${buildResumePolishGroundingContext(harness)}

[Current Answer]
${text}`,
    },
  ];

  const completion = await openai.chat.completions.create({
    model: resolveModel("resume.polish"),
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const result: any = safeJsonParse(completion.choices[0].message.content);

  const notes = (result.notes || []).slice(0, 5);
  const spans = findSpansInText(text, notes);

  const polishedHarness = mergeResumePolishIntoHarness(harness, {
    notes: notes.map(
      (note: any): ResumeHarnessNote => ({
        quote: typeof note?.quote === "string" ? note.quote : "",
        note: typeof note?.note === "string" ? note.note : "",
        type: typeof note?.type === "string" ? note.type : "",
      }),
    ),
    generatedAt: polishAt,
  });

  await persistResumeEditHarnessSnapshot({
    questionId,
    harness: polishedHarness,
    content: `AI가 첨삭 포인트 ${notes.length}개를 분석했습니다.`,
  });

  logResumeEvent("POLISH_DONE", {
    teamId,
    notesCount: notes.length,
  });

  return { notes, spans };
}

export async function repolishResumeAnswer(input: {
  teamId: string;
  userId?: string;
  questionId?: string;
  originalText: string;
  question?: string;
  bricks?: any[];
  briefContext?: string;
  selectedNotes?: any[];
  userInstruction?: string;
  charLimit?: number;
}) {
  const {
    teamId,
    userId,
    questionId,
    originalText,
    question,
    bricks,
    briefContext,
    selectedNotes,
    userInstruction,
    charLimit,
  } =
    input;

  if (!originalText) {
    throwErr("BAD_REQUEST", 400, "Original text is required");
  }

  logResumeEvent("REPOLISH_REQUEST", {
    teamId,
    charLimit,
    selectedNotesCount: selectedNotes?.length ?? 0,
  });

  await consumeTeamQuota({
    teamId,
    userId,
    targetId: questionId,
    type: "RESUME",
    action: "resume_repolish",
  });

  const repolishAt = new Date().toISOString();
  const harness = await loadResumeEditHarness({
    userId,
    questionId,
    question,
    briefContext,
    bricks,
    currentAnswer: originalText,
    syncedAt: repolishAt,
  });
  const normalizedSelectedNotes = Array.isArray(selectedNotes)
    ? selectedNotes.map(
        (note: any): ResumeHarnessNote => ({
          quote: typeof note?.quote === "string" ? note.quote : "",
          note: typeof note?.note === "string" ? note.note : "",
          type: typeof note?.type === "string" ? note.type : "",
        }),
      )
    : [];
  const promptBundle = buildResumeRepolishPromptBundle({
    harness,
    userInstruction:
      userInstruction ||
      "No specific rewrite direction provided. Keep the meaning, and just polish the sentences naturally.",
    selectedNotes: normalizedSelectedNotes,
    charLimit,
  });

  const systemPrompt = fillTemplate(RESUME_PROMPTS.repolish.system, {
    charLimit: String(charLimit || 700),
  });

  const completion = await openai.chat.completions.create({
    model: resolveModel("resume.repolish"),
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\n${promptBundle.systemPrompt}`.trim(),
      },
      { role: "user", content: promptBundle.userPrompt },
    ],
    temperature: 0.2,
  });

  const rewrittenText = completion.choices[0].message.content;

  const rewrittenHarness = mergeResumePendingRewriteIntoHarness(harness, {
    userInstruction:
      userInstruction ||
      "No specific rewrite direction provided. Keep the meaning, and just polish the sentences naturally.",
    selectedNotes: normalizedSelectedNotes,
    revisedText: rewrittenText || originalText,
    generatedAt: repolishAt,
  });

  await persistResumeEditHarnessSnapshot({
    questionId,
    harness: rewrittenHarness,
    content: "AI가 첨삭 맥락을 반영한 수정안을 생성했습니다.",
  });

  logResumeEvent("REPOLISH_DONE", {
    teamId,
    outputLength: rewrittenText?.length ?? 0,
  });

  return { text: rewrittenText };
}

export async function listResumeQuestions(input: {
  userId: string;
  page: number;
  pageSize: number;
  q?: string;
  filter?: "ALL" | "COMPLETED" | "PENDING";
}) {
  const { userId, page, pageSize, q, filter = "ALL" } = input;

  const where: Prisma.QuestionWhereInput = {
    application: {
      userId,
      status: { not: "ARCHIVED" },
    },
  };

  if (filter === "COMPLETED") {
    where.isCompleted = true;
  } else if (filter === "PENDING") {
    where.isCompleted = false;
  }

  if (q) {
    where.OR = [
      { questionText: { contains: q, mode: "insensitive" } },
      { application: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      orderBy: { updatedAt: "desc" },
      include: {
        application: {
          select: {
            id: true,
            companyName: true,
            jobTitle: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return {
    items,
    total,
    totalPages: Math.ceil(total / pageSize),
    page,
    pageSize,
  };
}

export async function updateResumeQuestion(input: {
  userId: string;
  questionId: string;
  answer?: string;
  isCompleted?: boolean;
  relatedBricks?: { id: string }[];
}) {
  const { userId, questionId, answer, isCompleted, relatedBricks } = input;

  const accessibleQuestion = await getAccessibleQuestion({ userId, questionId });

  const updateData: any = {};
  let answerChanged = false;
  if (answer !== undefined && isCompleted !== true) {
    const canonicalAnswer = canonicalizeCareerAnswer(answer);
    updateData.answer = canonicalAnswer;
    if (
      hashCareerAnswer(accessibleQuestion.answer ?? "") !==
      hashCareerAnswer(canonicalAnswer)
    ) {
      answerChanged = true;
      updateData.answerRevision = { increment: 1 };
      updateData.isCompleted = false;
    }
  }
  if (isCompleted === false) {
    updateData.isCompleted = isCompleted;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: updateData,
      });
      if (answerChanged) {
        await Promise.all([
          tx.careerAnswerGrounding.deleteMany({ where: { questionId } }),
          tx.careerAnswerVerification.deleteMany({ where: { questionId } }),
        ]);
      }
    });
  }

  if (relatedBricks && Array.isArray(relatedBricks)) {
    const activeBrickIds = new Set(relatedBricks.map((b: any) => b.id));
    const ownedBricks = await prisma.experienceBrick.count({
      where: {
        id: { in: [...activeBrickIds] },
        userId,
        memoryStatus: "CONFIRMED",
        careerFacts: {
          some: { active: true, trustStatus: "TRUSTED" },
        },
      },
    });
    if (ownedBricks !== activeBrickIds.size) {
      throwErr(
        "FORBIDDEN",
        403,
        "Experience does not belong to the application owner",
      );
    }

    await prisma.$transaction(async (tx) => {
      const existingLinks = await tx.questionOnBrick.findMany({
        where: { questionId },
      });

      for (const link of existingLinks) {
        const shouldBeSelected = activeBrickIds.has(link.brickId);
        if (link.isSelected !== shouldBeSelected) {
          await tx.questionOnBrick.update({
            where: {
              questionId_brickId: {
                questionId,
                brickId: link.brickId,
              },
            },
            data: { isSelected: shouldBeSelected },
          });
        }

        if (shouldBeSelected) {
          activeBrickIds.delete(link.brickId);
        }
      }

      for (const newBrickId of activeBrickIds) {
        await tx.questionOnBrick.create({
          data: {
            questionId,
            brickId: newBrickId,
            isSelected: true,
            isAiSuggested: false,
          },
        });
      }
    });
  }

  if (isCompleted === true) {
    const answerToFinalize =
      answer ??
      (
        await prisma.question.findUnique({
          where: { id: questionId },
          select: { answer: true },
        })
      )?.answer ??
      "";
    await finalizeCareerAnswer({
      questionId,
      userId,
      answer: answerToFinalize,
    });
  }

  const current = await prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    select: {
      answerRevision: true,
      relatedBricks: {
        orderBy: { createdAt: "asc" },
        select: {
          brickId: true,
          isAiSuggested: true,
          isSelected: true,
        },
      },
    },
  });
  return {
    ok: true,
    answerRevision: current.answerRevision,
    selectedExperiences: current.relatedBricks.map((link) => ({
      experienceId: link.brickId,
      isAiSuggested: link.isAiSuggested,
      isSelected: link.isSelected,
      isUserSelected: link.isSelected && !link.isAiSuggested,
    })),
  };
}

export async function listQuestionAiMessages(input: {
  userId: string;
  questionId: string;
}) {
  const { userId, questionId } = input;
  await getAccessibleQuestion({ userId, questionId });

  return prisma.questionAiMessage.findMany({
    where: { questionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createQuestionAiMessages(input: {
  userId: string;
  questionId: string;
  messages: {
    role: QuestionAiMessageRole;
    kind: QuestionAiMessageKind;
    content: string;
    meta?: Prisma.InputJsonValue;
  }[];
}) {
  const { userId, questionId, messages } = input;
  await getAccessibleQuestion({ userId, questionId });

  const sanitized = messages
    .map((message) => ({
      role: message.role,
      kind: message.kind,
      content: message.content.trim(),
      meta: message.meta,
    }))
    .filter((message) => message.content.length > 0);

  if (sanitized.length === 0) {
    return [];
  }

  return prisma.$transaction(
    sanitized.map((message) =>
      prisma.questionAiMessage.create({
        data: {
          questionId,
          role: message.role,
          kind: message.kind,
          content: message.content,
          meta: message.meta,
        },
      }),
    ),
  );
}

export async function generateResumeStrategy(input: {
  applicationId: string;
  userId: string;
  teamId: string;
}) {
  const { applicationId, userId, teamId } = input;

  const app = await prisma.application.findUnique({
    where: { id: applicationId, userId },
    include: { questions: true },
  });

  if (!app) {
    throwErr("NOT_FOUND", 404, "Application not found");
  }

  if (app.teamId && app.teamId !== teamId) {
    throwErr("FORBIDDEN", 403, "Team access denied");
  }

  await consumeTeamQuota({
    teamId,
    userId,
    targetId: applicationId,
    type: "RESUME",
    action: "resume_strategy",
  });

  const systemPrompt = fillTemplate(RESUME_PROMPTS.strategy.system, {
    companyName: app.companyName,
    jobTitle: app.jobTitle
  });
  const strategies = await Promise.all(
    app.questions.map(async (question, questionIndex) => {
      const memory = await retrieveCareerMemory({
        questionId: question.id,
        userId,
        topK: 8,
      });
      if (memory.experiences.length === 0) {
        throwErr("BAD_REQUEST", 400, "검증된 경력 사실이 없습니다.");
      }
      const allowedExperienceIds = new Set(
        memory.experiences.map((experience) => experience.id),
      );
      const completion = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              buildResumeStrategyPrompt({
                questionsText: `Q1. ${question.questionText}`,
                experiences: memory.experiences,
              }),
              `Allowed experience IDs: ${JSON.stringify([...allowedExperienceIds])}`,
            ].join("\n\n"),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      const aiResult: any = safeJsonParse(
        completion.choices[0].message.content,
      );
      const strategy = Array.isArray(aiResult.strategies)
        ? aiResult.strategies[0]
        : aiResult.strategy;
      return {
        questionIndex,
        rationale: strategy?.rationale ?? "",
        guideline: strategy?.guideline ?? "",
        brickIds: Array.isArray(strategy?.brickIds)
          ? [
              ...new Set(
                strategy.brickIds.filter((id: unknown): id is string =>
                  typeof id === "string" && allowedExperienceIds.has(id),
                ),
              ),
            ]
          : [],
      };
    }),
  );

  await prisma.$transaction(async (tx) => {
    for (const q of app.questions) {
      await tx.questionOnBrick.deleteMany({ where: { questionId: q.id } });
    }

    for (const strat of strategies) {
      const targetQ = app.questions[strat.questionIndex];
      if (!targetQ) continue;

      const adviceData = JSON.stringify({
        rationale: strat.rationale,
        guideline: strat.guideline,
      });

      await tx.question.update({
        where: { id: targetQ.id },
        data: { aiAdvice: adviceData },
      });

      if (strat.brickIds && Array.isArray(strat.brickIds)) {
        for (const bId of strat.brickIds as string[]) {
          await tx.questionOnBrick.create({
            data: {
              questionId: targetQ.id,
              brickId: bId,
              isAiSuggested: true,
              isSelected: true,
            },
          });
        }
      }
    }
  });

  const updatedQuestions = await prisma.question.findMany({
    where: { applicationId: app.id },
    include: {
      relatedBricks: {
        where: { brick: { userId } },
        include: { brick: true },
      },
    },
    orderBy: { order: "asc" },
  });

  return { items: updatedQuestions };
}

export async function suggestResumeQuestionBricks(input: {
  applicationId: string;
  questionId: string;
  userId: string;
  teamId: string;
  instruction?: string;
}) {
  const { applicationId, questionId, userId, teamId, instruction } = input;

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      questions: {
        where: { id: questionId },
        include: {
          relatedBricks: {
            where: { brick: { userId } },
            select: { brickId: true, isSelected: true },
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

  const targetQuestion = app.questions[0];
  if (!targetQuestion) {
    throwErr("NOT_FOUND", 404, "Question not found");
  }

  // ✅ [개선] RAG 서비스를 통해 질문과 가장 유사한 상위 10개 브릭만 추출
  const rankedBricks = await rankBricksForQuestion({
    questionText: targetQuestion.questionText,
    userId,
    teamId,
    topK: 10
  });

  if (rankedBricks.length === 0) {
    throwErr("BAD_REQUEST", 400, "추천할 경험(Brick)이 없습니다.");
  }

  await consumeTeamQuota({
    teamId,
    userId,
    targetId: targetQuestion.id,
    type: "RESUME",
    action: "resume_strategy",
  });

  const currentSelectedExperienceIds = targetQuestion.relatedBricks
    .filter((link) => link.isSelected)
    .map((link) => link.brickId);
  const suggestionPrompt = buildResumeSuggestionPrompt({
    companyName: app.companyName,
    jobTitle: app.jobTitle,
    questionText: targetQuestion.questionText,
    currentSelectedExperienceIds,
    instruction: instruction || "없음",
    experiences: rankedBricks,
  });

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: RESUME_PROMPTS.suggestBricks.system },
      {
        role: "user",
        content: suggestionPrompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const result: any = safeJsonParse(completion.choices[0].message.content);
  const suggestedIds = Array.isArray(result.brickIds) ? result.brickIds.slice(0, 3) : [];

  const suggestedBricks = suggestedIds
    .map((id: string) => rankedBricks.find((experience) => experience.id === id))
    .filter(Boolean);

  return {
    suggestedBricks,
    reason:
      result.reason || "문항과 가장 관련성이 높은 경험으로 다시 연결할 후보를 골랐습니다.",
    guideline: result.guideline || "",
  };
}
