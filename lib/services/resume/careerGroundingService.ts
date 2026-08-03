import { CareerGroundingOperation } from "@prisma/client";

import {
  hashCareerAnswer,
  hashCareerRetrievalQuery,
} from "@/domain/career-memory/answerHash";
import { validateGroundingSelection } from "@/domain/career-memory/retrievalPolicy";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

export async function persistCareerGrounding(input: {
  questionId: string;
  userId: string;
  operation: CareerGroundingOperation;
  answer: string;
  query: string;
  modelVersion: string;
  retrievalVersion: string;
  usedExperienceIds: readonly string[];
  usedFactIds: readonly string[];
  preferredExperienceIds?: readonly string[];
  retrievedExperienceIds: readonly string[];
  retrievedFactIds: readonly string[];
  memoryVersion?: number;
}) {
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, application: { userId: input.userId } },
    select: { id: true, answer: true, answerRevision: true },
  });
  if (!question) {
    throw serviceError(404, "CAREER_QUESTION_NOT_FOUND", "Question not found");
  }
  const selected = validateGroundingSelection(input);
  const answerRevision =
    hashCareerAnswer(question.answer ?? "") === hashCareerAnswer(input.answer)
      ? question.answerRevision
      : question.answerRevision + 1;
  const preferredExperienceIds = [
    ...new Set(input.preferredExperienceIds ?? []),
  ];
  const [trustedFacts, supportedExperienceCount] = await Promise.all([
    prisma.careerFact.findMany({
      where: {
        id: { in: selected.factIds },
        userId: input.userId,
        active: true,
        trustStatus: "TRUSTED",
      },
      select: { id: true, experienceId: true },
    }),
    prisma.experienceBrick.count({
      where: {
        id: { in: selected.experienceIds },
        userId: input.userId,
        memoryStatus: "CONFIRMED",
        careerFacts: {
          some: { active: true, trustStatus: "TRUSTED" },
        },
      },
    }),
  ]);
  if (
    trustedFacts.length !== selected.factIds.length ||
    supportedExperienceCount !== selected.experienceIds.length
  ) {
    throw serviceError(
      400,
      "CAREER_GROUNDING_UNTRUSTED",
      "Grounding may only reference active trusted career memory",
    );
  }
  const preferred = new Set(preferredExperienceIds);
  const fallbackUsed =
    selected.experienceIds.some((id) => !preferred.has(id)) ||
    trustedFacts.some((fact) => !preferred.has(fact.experienceId));
  return prisma.careerAnswerGrounding.create({
    data: {
      questionId: question.id,
      userId: input.userId,
      operation: input.operation,
      answerHash: hashCareerAnswer(input.answer),
      answerRevision,
      queryHash: hashCareerRetrievalQuery([input.query]),
      modelVersion: input.modelVersion,
      retrievalVersion: input.retrievalVersion,
      memoryVersion: input.memoryVersion ?? 0,
      preferredExperienceIds,
      retrievedExperienceIds: [...new Set(input.retrievedExperienceIds)],
      retrievedFactIds: [...new Set(input.retrievedFactIds)],
      fallbackUsed,
      experiences: {
        create: selected.experienceIds.map((experienceId) => ({ experienceId })),
      },
      facts: {
        create: selected.factIds.map((factId) => ({ factId })),
      },
    },
    include: {
      experiences: true,
      facts: true,
    },
  });
}

export async function getCareerGrounding(input: {
  questionId: string;
  userId: string;
  answer?: string | null;
}) {
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, application: { userId: input.userId } },
    select: { id: true, answer: true, answerRevision: true },
  });
  if (!question) {
    throw serviceError(404, "CAREER_QUESTION_NOT_FOUND", "Question not found");
  }
  const answerHash = hashCareerAnswer(input.answer ?? question.answer ?? "");
  const answerRevision =
    input.answer !== undefined &&
    hashCareerAnswer(question.answer ?? "") !== answerHash
      ? question.answerRevision + 1
      : question.answerRevision;
  const grounding = await prisma.careerAnswerGrounding.findFirst({
    where: {
      questionId: question.id,
      userId: input.userId,
      answerHash,
      answerRevision,
    },
    include: {
      experiences: {
        include: {
          experience: {
            select: {
              id: true,
              title: true,
              organization: true,
              roleTitle: true,
            },
          },
        },
      },
      facts: {
        where: {
          fact: {
            userId: input.userId,
          },
        },
        include: {
          fact: {
            select: {
              id: true,
              kind: true,
              value: true,
              fieldPath: true,
              active: true,
              trustStatus: true,
              evidence: {
                select: {
                  origin: true,
                  excerpt: true,
                  pageStart: true,
                  pageEnd: true,
                  sourceChunk: {
                    select: {
                      source: { select: { originalName: true } },
                    },
                  },
                  candidate: {
                    select: {
                      source: { select: { originalName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!grounding) return null;
  return {
    ...grounding,
    preferredExperienceIds: grounding.preferredExperienceIds,
    retrievedExperienceIds: grounding.retrievedExperienceIds,
    usedExperienceIds: grounding.experiences.map((item) => item.experienceId),
    usedFactIds: grounding.facts.map((item) => item.factId),
    experienceIds: grounding.experiences.map((item) => item.experienceId),
    factIds: grounding.facts.map((item) => item.factId),
    experiences: grounding.experiences.map((item) => ({
      experienceId: item.experienceId,
      title: item.experience.title,
      organization: item.experience.organization,
      roleTitle: item.experience.roleTitle,
    })),
    facts: grounding.facts.map((item) => ({
      factId: item.factId,
      kind: item.fact.kind,
      fieldPath: item.fact.fieldPath,
      value: item.fact.value,
      active: item.fact.active,
      trustStatus: item.fact.trustStatus,
      evidence: item.fact.evidence.map((evidence) => ({
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
    })),
  };
}
