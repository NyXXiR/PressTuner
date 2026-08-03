import OpenAI from "openai";
import {
  CareerFindingType,
  CareerRiskCategory,
  CareerVerificationResult,
} from "@prisma/client";
import { z } from "zod";

import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import {
  computeCareerVerificationResult,
  normalizeCareerFindingSupport,
} from "@/domain/career-memory/verificationPolicy";
import { AI_MODELS } from "@/lib/constants/ai";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import {
  retrieveTrustedCareerFactsForClaims,
  type CareerVerificationClaim,
  type RetrievedCareerVerificationFact,
} from "./careerRetrievalService";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FindingSchema = z.object({
  findings: z.array(
    z.object({
      type: z.nativeEnum(CareerFindingType),
      riskCategory: z.nativeEnum(CareerRiskCategory),
      claim: z.string().trim().min(1),
      explanation: z.string().trim().min(1),
      supportingFactIds: z.array(z.string()).default([]),
    }),
  ),
});
const ClaimSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string().trim().min(1),
      riskCategory: z.nativeEnum(CareerRiskCategory),
    }),
  ),
});

export const CAREER_VERIFIER_VERSION = "career-claims-v1";

export function buildCareerClaimResponseFormat() {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "career_claims",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          claims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                claim: { type: "string" },
                riskCategory: {
                  type: "string",
                  enum: ["NUMBER", "DATE", "ORGANIZATION", "TITLE", "OTHER"],
                },
              },
              required: ["claim", "riskCategory"],
            },
          },
        },
        required: ["claims"],
      },
    },
  };
}

export function buildCareerFindingResponseFormat(
  allowedFactIds: readonly string[],
) {
  const supportingFactItems =
    allowedFactIds.length > 0
      ? { type: "string" as const, enum: [...allowedFactIds] }
      : { type: "string" as const };
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "career_findings",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          findings: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: {
                  type: "string",
                  enum: ["SUPPORTED", "CONTRADICTION", "UNSUPPORTED"],
                },
                riskCategory: {
                  type: "string",
                  enum: ["NUMBER", "DATE", "ORGANIZATION", "TITLE", "OTHER"],
                },
                claim: { type: "string" },
                explanation: { type: "string" },
                supportingFactIds: {
                  type: "array",
                  items: supportingFactItems,
                  ...(allowedFactIds.length === 0 ? { maxItems: 0 } : {}),
                },
              },
              required: [
                "type",
                "riskCategory",
                "claim",
                "explanation",
                "supportingFactIds",
              ],
            },
          },
        },
        required: ["findings"],
      },
    },
  };
}

async function loadVerificationContext(input: {
  questionId: string;
  userId: string;
}) {
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, application: { userId: input.userId } },
    select: {
      id: true,
      answer: true,
      answerRevision: true,
      questionText: true,
      application: { select: { companyName: true, jobTitle: true } },
    },
  });
  if (!question) {
    throw serviceError(404, "CAREER_QUESTION_NOT_FOUND", "Question not found");
  }
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { careerMemoryVersion: true },
  });
  if (!user) throw serviceError(404, "CAREER_USER_NOT_FOUND", "User not found");
  const answer = question.answer ?? "";
  const answerHash = hashCareerAnswer(answer);
  const grounding = await prisma.careerAnswerGrounding.findFirst({
    where: {
      questionId: question.id,
      userId: input.userId,
      answerHash,
    },
    include: {
      experiences: {
        where: {
          experience: {
            userId: input.userId,
            memoryStatus: "CONFIRMED",
            careerFacts: {
              some: { active: true, trustStatus: "TRUSTED" },
            },
          },
        },
      },
      facts: {
        where: {
          fact: {
            userId: input.userId,
            active: true,
            trustStatus: "TRUSTED",
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const groundedFactIds = grounding?.facts.map((item) => item.factId) ?? [];
  return {
    question,
    answer,
    answerHash,
    answerRevision: question.answerRevision,
    careerMemoryVersion: user.careerMemoryVersion,
    grounding,
    groundedFactIds,
  };
}

type CareerVerificationFinding = z.infer<
  typeof FindingSchema
>["findings"][number];

type CareerVerificationDependencies = {
  extractClaims: (input: {
    question: string;
    answer: string;
  }) => Promise<CareerVerificationClaim[]>;
  retrieveFacts: (input: {
    userId: string;
    claims: readonly CareerVerificationClaim[];
    exactGroundedFactIds: readonly string[];
  }) => Promise<RetrievedCareerVerificationFact[]>;
  classifyClaims: (input: {
    question: string;
    answer: string;
    claims: readonly CareerVerificationClaim[];
    facts: readonly RetrievedCareerVerificationFact[];
  }) => Promise<CareerVerificationFinding[]>;
  beforePersist: () => Promise<void>;
};

async function presentCareerVerification<
  T extends {
    findings: readonly {
      supportingFactIds: string[];
      [key: string]: unknown;
    }[];
  },
>(verification: T | null, userId: string) {
  if (!verification) return null;
  const factIds = [
    ...new Set(
      verification.findings.flatMap((finding) => finding.supportingFactIds),
    ),
  ];
  const facts = factIds.length
    ? await prisma.careerFact.findMany({
        where: { id: { in: factIds }, userId },
        select: {
          id: true,
          kind: true,
          value: true,
          fieldPath: true,
          experience: {
            select: {
              title: true,
              organization: true,
              roleTitle: true,
            },
          },
          evidence: {
            select: {
              origin: true,
              excerpt: true,
              pageStart: true,
              pageEnd: true,
              sourceChunk: {
                select: { source: { select: { originalName: true } } },
              },
              candidate: {
                select: { source: { select: { originalName: true } } },
              },
            },
          },
        },
      })
    : [];
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  return {
    ...verification,
    findings: verification.findings.map((finding) => ({
      ...finding,
      supportingFacts: finding.supportingFactIds.flatMap((id) => {
        const fact = factsById.get(id);
        if (!fact) return [];
        return [
          {
            factId: fact.id,
            kind: fact.kind,
            value: fact.value,
            fieldPath: fact.fieldPath,
            experience: fact.experience,
            evidence: fact.evidence.map((evidence) => ({
              excerpt: evidence.excerpt,
              pageStart: evidence.pageStart,
              pageEnd: evidence.pageEnd,
              documentName:
                evidence.sourceChunk?.source.originalName ??
                evidence.candidate?.source?.originalName ??
                (evidence.origin === "USER_ASSERTION"
                  ? "사용자 입력"
                  : "삭제된 원본"),
            })),
          },
        ];
      }),
    })),
  };
}

async function defaultExtractClaims(input: {
  question: string;
  answer: string;
}): Promise<CareerVerificationClaim[]> {
  const completion = await client.chat.completions.create({
    model: AI_MODELS.SMART_MINI,
    messages: [
      {
        role: "system",
        content: [
          "Extract every factual claim from the answer.",
          "Risk category must be NUMBER, DATE, ORGANIZATION, TITLE, or OTHER.",
          "Return JSON exactly shaped as {claims:[{claim,riskCategory}]}.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: buildCareerClaimResponseFormat(),
    temperature: 0,
  });
  try {
    return ClaimSchema.parse(
      JSON.parse(completion.choices[0]?.message.content ?? ""),
    ).claims;
  } catch {
    throw serviceError(
      502,
      "CAREER_VERIFIER_OUTPUT_INVALID",
      "Verifier claim output was invalid",
    );
  }
}

async function defaultClassifyClaims(input: {
  question: string;
  answer: string;
  claims: readonly CareerVerificationClaim[];
  facts: readonly RetrievedCareerVerificationFact[];
}): Promise<CareerVerificationFinding[]> {
  const completion = await client.chat.completions.create({
    model: AI_MODELS.SMART_MINI,
    messages: [
      {
        role: "system",
        content: [
          "Compare every supplied claim with only the supplied trusted facts.",
          "Classify each as SUPPORTED, CONTRADICTION, or UNSUPPORTED.",
          "Keep the supplied risk category and cite only supplied fact IDs.",
          "A SUPPORTED finding must copy supporting IDs into supportingFactIds; IDs mentioned only in explanation do not count.",
          "Compatible facts: NUMBER may cite METRIC, ACTION, OUTCOME, or SUMMARY; DATE may cite START_DATE, END_DATE, or SUMMARY; ORGANIZATION may cite ORGANIZATION or SUMMARY; TITLE may cite TITLE or SUMMARY.",
          "Return JSON exactly shaped as {findings:[{type,riskCategory,claim,explanation,supportingFactIds}]}.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: buildCareerFindingResponseFormat(
      input.facts.map(({ id }) => id),
    ),
    temperature: 0,
  });
  try {
    return FindingSchema.parse(
      JSON.parse(completion.choices[0]?.message.content ?? ""),
    ).findings;
  } catch {
    throw serviceError(
      502,
      "CAREER_VERIFIER_OUTPUT_INVALID",
      "Verifier output was invalid",
    );
  }
}

export async function verifyCareerAnswer(input: {
  questionId: string;
  userId: string;
}, dependencies: Partial<CareerVerificationDependencies> = {}) {
  const context = await loadVerificationContext(input);
  if (!context.answer.trim()) {
    throw serviceError(400, "CAREER_ANSWER_REQUIRED", "Answer is required");
  }
  const model = AI_MODELS.SMART_MINI;
  const claims = await (dependencies.extractClaims ?? defaultExtractClaims)({
    question: context.question.questionText,
    answer: context.answer,
  });
  const retrieved = await (
    dependencies.retrieveFacts ??
    ((request) => retrieveTrustedCareerFactsForClaims(request))
  )({
    userId: input.userId,
    claims,
    exactGroundedFactIds: context.groundedFactIds,
  });
  const facts = retrieved.filter(
    (fact) =>
      fact.userId === input.userId &&
      fact.active &&
      fact.trustStatus === "TRUSTED" &&
      fact.experienceStatus === "CONFIRMED",
  );
  const classified = await (
    dependencies.classifyClaims ?? defaultClassifyClaims
  )({
    question: context.question.questionText,
    answer: context.answer,
    claims,
    facts,
  });
  const allowedFactIds = new Set(facts.map((fact) => fact.id));
  for (const finding of classified) {
    if (finding.supportingFactIds.some((id) => !allowedFactIds.has(id))) {
      throw serviceError(
        502,
        "CAREER_VERIFIER_FACT_UNKNOWN",
        "Verifier cited an unknown fact",
      );
    }
  }
  const findings = classified.map((finding) =>
    normalizeCareerFindingSupport(finding, facts),
  );
  const result = computeCareerVerificationResult(findings);
  await dependencies.beforePersist?.();
  const verification = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT question."id"
      FROM "question" AS question
      JOIN "application" AS application ON application."id" = question."application_id"
      WHERE question."id" = ${context.question.id}
        AND application."user_id" = ${input.userId}
      FOR UPDATE OF question
    `;
    await tx.$queryRaw`
      SELECT "id" FROM "user" WHERE "id" = ${input.userId} FOR UPDATE
    `;
    const [currentQuestion, currentUser] = await Promise.all([
      tx.question.findUnique({
        where: { id: context.question.id },
        select: { answer: true, answerRevision: true },
      }),
      tx.user.findUnique({
        where: { id: input.userId },
        select: { careerMemoryVersion: true },
      }),
    ]);
    if (
      !currentQuestion ||
      !currentUser ||
      hashCareerAnswer(currentQuestion.answer ?? "") !== context.answerHash ||
      currentQuestion.answerRevision !== context.answerRevision ||
      currentUser.careerMemoryVersion !== context.careerMemoryVersion
    ) {
      throw serviceError(
        409,
        "CAREER_VERIFICATION_STALE",
        "Answer or career memory changed during verification",
      );
    }
    return tx.careerAnswerVerification.create({
      data: {
        questionId: context.question.id,
        userId: input.userId,
        answerHash: context.answerHash,
        answerRevision: context.answerRevision,
        careerMemoryVersion: context.careerMemoryVersion,
        verifierVersion: CAREER_VERIFIER_VERSION,
        modelVersion: model,
        result: result as CareerVerificationResult,
        findings: {
          create: findings.map((finding) => ({
            type: finding.type,
            riskCategory: finding.riskCategory,
            claim: finding.claim,
            explanation: finding.explanation,
            supportingFactIds: finding.supportingFactIds,
          })),
        },
      },
      include: { findings: true, override: true },
    });
  });
  console.info("[career-verification] completed", {
    questionId: context.question.id,
    answerHashPrefix: context.answerHash.slice(0, 12),
    answerRevision: context.answerRevision,
    careerMemoryVersion: context.careerMemoryVersion,
    claimCount: claims.length,
    factCount: facts.length,
    findingCount: findings.length,
    result,
  });
  const presented = await presentCareerVerification(
    verification,
    input.userId,
  );
  if (!presented) {
    throw new Error("CAREER_VERIFICATION_PRESENTATION_MISSING");
  }
  return presented;
}

export async function getCurrentCareerVerification(input: {
  questionId: string;
  userId: string;
}) {
  const context = await loadVerificationContext(input);
  const verification = await prisma.careerAnswerVerification.findFirst({
    where: {
      questionId: context.question.id,
      userId: input.userId,
      answerHash: context.answerHash,
      answerRevision: context.answerRevision,
      careerMemoryVersion: context.careerMemoryVersion,
    },
    include: { findings: true, override: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    verification: await presentCareerVerification(verification, input.userId),
    current: {
      answerHash: context.answerHash,
      answerRevision: context.answerRevision,
      careerMemoryVersion: context.careerMemoryVersion,
    },
  };
}

export async function createCareerVerificationOverride(input: {
  verificationId: string;
  userId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) {
    throw serviceError(400, "CAREER_OVERRIDE_REASON_REQUIRED", "Override reason is required");
  }
  const verification = await prisma.careerAnswerVerification.findFirst({
    where: { id: input.verificationId, userId: input.userId },
    include: {
      question: { select: { answer: true, answerRevision: true } },
      user: { select: { careerMemoryVersion: true } },
    },
  });
  if (!verification) {
    throw serviceError(404, "CAREER_VERIFICATION_NOT_FOUND", "Verification not found");
  }
  if (verification.result !== CareerVerificationResult.BLOCK) {
    throw serviceError(409, "CAREER_OVERRIDE_NOT_BLOCKED", "Only blocked verification can be overridden");
  }
  const currentHash = hashCareerAnswer(verification.question.answer ?? "");
  if (
    verification.answerHash !== currentHash ||
    verification.answerRevision !== verification.question.answerRevision ||
    verification.careerMemoryVersion !== verification.user.careerMemoryVersion
  ) {
    throw serviceError(409, "CAREER_VERIFICATION_STALE", "Verification is no longer current");
  }
  return prisma.careerVerificationOverride.upsert({
    where: { verificationId: verification.id },
    create: {
      verificationId: verification.id,
      userId: input.userId,
      reason,
      answerHash: verification.answerHash,
      answerRevision: verification.answerRevision,
    },
    update: {
      userId: input.userId,
      reason,
      answerHash: verification.answerHash,
      answerRevision: verification.answerRevision,
    },
  });
}
