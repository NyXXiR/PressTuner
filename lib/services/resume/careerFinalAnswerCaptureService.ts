import {
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerCaptureStatus,
  CareerEvidenceOrigin,
  Prisma,
} from "@prisma/client";
import OpenAI from "openai";
import { z } from "zod";

import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import { fingerprintCareerValue } from "@/domain/career-memory/evidencePolicy";
import {
  normalizeFinalAnswerCaptureItems,
  type FinalAnswerCaptureItem,
} from "@/domain/career-memory/finalAnswerCapture";
import { AI_MODELS } from "@/lib/constants/ai";
import { prisma } from "@/lib/prisma";
import {
  createCareerCandidatesInTransaction,
  type CareerCandidateFields,
} from "./careerCandidateService";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ExtractionSchema = z.object({
  summary: z.string().trim().max(2_000).nullable().optional(),
  items: z.array(
    z.object({
      mode: z.nativeEnum(CareerCandidateMode),
      targetExperienceId: z.string().nullable().optional(),
      title: z.string(),
      content: z.string(),
      originalText: z.string().nullable().optional(),
      organization: z.string().nullable().optional(),
      roleTitle: z.string().nullable().optional(),
      period: z.string().nullable().optional(),
      actions: z.array(z.string()).optional(),
      outcomes: z.array(z.string()).optional(),
      metrics: z.array(z.string()).optional(),
      tools: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      evidence: z.array(
        z.object({ fieldPath: z.string(), excerpt: z.string() }),
      ),
    }),
  ),
});

export function buildFinalAnswerCaptureResponseFormat() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "career_final_answer_capture",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: ["string", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                mode: {
                  type: "string",
                  enum: ["CREATE", "AUGMENT", "LINK"],
                },
                targetExperienceId: { type: ["string", "null"] },
                title: { type: "string" },
                content: { type: "string" },
                originalText: { type: ["string", "null"] },
                organization: { type: ["string", "null"] },
                roleTitle: { type: ["string", "null"] },
                period: { type: ["string", "null"] },
                actions: { type: "array", items: { type: "string" } },
                outcomes: { type: "array", items: { type: "string" } },
                metrics: { type: "array", items: { type: "string" } },
                tools: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
                evidence: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      fieldPath: { type: "string" },
                      excerpt: { type: "string" },
                    },
                    required: ["fieldPath", "excerpt"],
                  },
                },
              },
              required: [
                "mode",
                "targetExperienceId",
                "title",
                "content",
                "originalText",
                "organization",
                "roleTitle",
                "period",
                "actions",
                "outcomes",
                "metrics",
                "tools",
                "tags",
                "evidence",
              ],
            },
          },
        },
        required: ["summary", "items"],
      },
    },
  };
}

function valueAtPath(item: FinalAnswerCaptureItem, fieldPath: string) {
  if (fieldPath === "summary") return `${item.title.trim()}\n${item.content.trim()}`;
  if (fieldPath === "organization") return item.organization;
  if (fieldPath === "roleTitle") return item.roleTitle;
  const indexed = /^(actions|outcomes|metrics|tools|tags)\[(\d+)\]$/.exec(
    fieldPath,
  );
  if (!indexed) return undefined;
  const values = item[
    indexed[1] as "actions" | "outcomes" | "metrics" | "tools" | "tags"
  ];
  return values?.[Number(indexed[2])];
}

async function defaultExtract(input: {
  answer: string;
  existingExperiences: readonly {
    id: string;
    title: string;
    content: string;
    organization: string | null;
    roleTitle: string | null;
  }[];
}) {
  const completion = await client.chat.completions.create({
    model: AI_MODELS.SMART_MINI,
    messages: [
      {
        role: "system",
        content: [
          "Extract zero or more distinct career experiences explicitly stated in the final answer.",
          "Use CREATE for new experiences, AUGMENT for new fields on an existing experience, and LINK for an already-known unchanged experience.",
          "Every proposed field needs a verbatim answer excerpt and every AUGMENT/LINK needs an existing targetExperienceId.",
          "Return JSON as {summary,items:[{mode,targetExperienceId,title,content,organization,roleTitle,period,actions,outcomes,metrics,tools,tags,evidence:[{fieldPath,excerpt}]}]}.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: buildFinalAnswerCaptureResponseFormat(),
    temperature: 0,
  });
  return ExtractionSchema.parse(
    JSON.parse(completion.choices[0]?.message.content ?? ""),
  );
}

export async function captureFinalAnswerProposals(
  input: {
    questionId: string;
    userId: string;
    answer: string;
    answerRevision: number;
  },
  dependencies: {
    extract?: typeof defaultExtract;
  } = {},
) {
  const existingExperiences = await prisma.experienceBrick.findMany({
    where: { userId: input.userId, memoryStatus: "CONFIRMED" },
    select: {
      id: true,
      title: true,
      content: true,
      organization: true,
      roleTitle: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const extracted = await (dependencies.extract ?? defaultExtract)({
    answer: input.answer,
    existingExperiences,
  });
  const items = normalizeFinalAnswerCaptureItems(input.answer, extracted.items);
  const answerHash = hashCareerAnswer(input.answer);

  try {
    return await prisma.$transaction(async (tx) => {
    const question = await tx.question.findFirst({
      where: {
        id: input.questionId,
        application: { userId: input.userId },
        answerRevision: input.answerRevision,
        answer: input.answer,
        isCompleted: true,
      },
      select: { id: true },
    });
    if (!question) throw new Error("CAREER_CAPTURE_SNAPSHOT_STALE");
    await tx.careerCaptureProposal.updateMany({
      where: {
        questionId: input.questionId,
        userId: input.userId,
        status: CareerCaptureStatus.PENDING,
        NOT: { answerHash, answerRevision: input.answerRevision },
      },
      data: {
        status: CareerCaptureStatus.SUPERSEDED,
        resolvedAt: new Date(),
      },
    });
    const proposal = await tx.careerCaptureProposal.upsert({
      where: {
        userId_questionId_answerHash_answerRevision: {
          userId: input.userId,
          questionId: input.questionId,
          answerHash,
          answerRevision: input.answerRevision,
        },
      },
      create: {
        userId: input.userId,
        questionId: input.questionId,
        answerHash,
        answerRevision: input.answerRevision,
        status:
          items.length === 0
            ? CareerCaptureStatus.APPLIED
            : CareerCaptureStatus.PENDING,
        summary: extracted.summary ?? null,
        resolvedAt: items.length === 0 ? new Date() : null,
      },
      update: {},
      include: { candidates: { include: { evidence: true } } },
    });
    if (proposal.candidates.length === 0 && items.length > 0) {
      const candidates = await createCareerCandidatesInTransaction(
        tx,
        items.map((item) => {
          const fields: CareerCandidateFields = {
            title: item.title,
            content: item.content,
            originalText: item.originalText,
            organization: item.organization,
            roleTitle: item.roleTitle,
            period: item.period,
            actions: item.actions,
            outcomes: item.outcomes,
            metrics: item.metrics,
            tools: item.tools,
            tags: item.tags,
          };
          return {
            userId: input.userId,
            origin: CareerCandidateOrigin.FINAL_ANSWER,
            mode: item.mode,
            questionId: input.questionId,
            captureProposalId: proposal.id,
            finalAnswerDedupeKey: item.finalAnswerDedupeKey,
            targetExperienceId: item.targetExperienceId,
            fields,
            evidence: item.evidence.flatMap((evidence) => {
              const value = valueAtPath(item, evidence.fieldPath);
              if (value === undefined || value === null) return [];
              return [
                {
                  fieldPath: evidence.fieldPath,
                  excerpt: evidence.excerpt,
                  origin: CareerEvidenceOrigin.USER_ASSERTION,
                  valueHash: fingerprintCareerValue(value),
                },
              ];
            }),
          };
        }),
      );
      return { ...proposal, candidates };
    }
    return proposal;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.careerCaptureProposal.findUniqueOrThrow({
        where: {
          userId_questionId_answerHash_answerRevision: {
            userId: input.userId,
            questionId: input.questionId,
            answerHash,
            answerRevision: input.answerRevision,
          },
        },
        include: { candidates: { include: { evidence: true } } },
      });
    }
    throw error;
  }
}
