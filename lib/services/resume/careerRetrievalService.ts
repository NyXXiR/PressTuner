import { CareerFactKind, Prisma } from "@prisma/client";

import { buildCareerRetrievalQuery } from "@/domain/career-memory/retrievalPolicy";
import { projectTrustedCareerExperiences } from "@/domain/career-memory/careerTrustedGeneration";
import { AI_MODELS } from "@/lib/constants/ai";
import { getEmbedding } from "@/lib/llm/embedding";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

type ExperienceRow = {
  id: string;
  score: number;
  isPreferred: boolean;
};

type FactRow = {
  id: string;
  experienceId: string;
  kind: CareerFactKind;
  fieldPath: string;
  value: string;
  score: number;
};

export const CAREER_RETRIEVAL_VERSION = "career-hybrid-v1";

export async function retrieveCareerMemory(input: {
  questionId: string;
  userId: string;
  instruction?: string;
  topK?: number;
}, dependencies: {
  getEmbedding?: typeof getEmbedding;
} = {}) {
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, application: { userId: input.userId } },
    select: {
      id: true,
      questionText: true,
      charLimit: true,
      application: {
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          jdText: true,
          teamId: true,
        },
      },
    },
  });
  if (!question) {
    throw serviceError(404, "CAREER_QUESTION_NOT_FOUND", "Question not found");
  }
  const query = buildCareerRetrievalQuery({
    questionText: question.questionText,
    companyName: question.application.companyName,
    jobTitle: question.application.jobTitle,
    jdText: question.application.jdText,
    instruction: input.instruction,
  });
  const embedding = await (dependencies.getEmbedding ?? getEmbedding)(query);
  const vectorLiteral = `[${embedding.join(",")}]`;
  const textSearchQuery = [
    ...new Set(query.match(/[\p{L}\p{N}_-]+/gu) ?? []),
  ]
    .map((term) => `"${term.replaceAll('"', "")}"`)
    .join(" OR ");
  const limit = Math.min(20, Math.max(1, input.topK ?? 8));
  const candidateLimit = Math.max(20, limit * 4);
  const [preferredLinks, user] = await Promise.all([
    prisma.questionOnBrick.findMany({
      where: {
        questionId: question.id,
        isSelected: true,
        brick: {
          userId: input.userId,
          memoryStatus: "CONFIRMED",
          careerFacts: {
            some: { active: true, trustStatus: "TRUSTED" },
          },
        },
      },
      select: { brickId: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { careerMemoryVersion: true },
    }),
  ]);
  const preferredExperienceIds = preferredLinks.map((link) => link.brickId);

  const [experiences, facts] = await Promise.all([
    prisma.$queryRaw<ExperienceRow[]>(Prisma.sql`
      WITH vector_ranked AS (
        SELECT eb."id", ROW_NUMBER() OVER (
          ORDER BY eb."embedding" <=> ${vectorLiteral}::vector
        ) AS rank
        FROM "experience_brick" eb
        WHERE eb."user_id" = ${input.userId}
          AND eb."memory_status" = 'CONFIRMED'
          AND EXISTS (
            SELECT 1 FROM "career_fact" trusted_fact
            WHERE trusted_fact."experience_id" = eb."id"
              AND trusted_fact."user_id" = ${input.userId}
              AND trusted_fact."active" = true
              AND trusted_fact."trust_status" = 'TRUSTED'
          )
          AND eb."embedding" IS NOT NULL
          AND eb."embedding_content_hash" IS NOT NULL
          AND eb."embedding_model" = ${AI_MODELS.EMBEDDING}
          AND eb."embedded_revision" = eb."embedding_revision"
        ORDER BY eb."embedding" <=> ${vectorLiteral}::vector
        LIMIT ${candidateLimit}
      ),
      text_ranked AS (
        SELECT eb."id", ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector('simple', CONCAT_WS(' ', eb."title", eb."content", eb."organization", eb."role_title")),
            websearch_to_tsquery('simple', ${textSearchQuery})
          ) DESC
        ) AS rank
        FROM "experience_brick" eb
        WHERE eb."user_id" = ${input.userId}
          AND eb."memory_status" = 'CONFIRMED'
          AND EXISTS (
            SELECT 1 FROM "career_fact" trusted_fact
            WHERE trusted_fact."experience_id" = eb."id"
              AND trusted_fact."user_id" = ${input.userId}
              AND trusted_fact."active" = true
              AND trusted_fact."trust_status" = 'TRUSTED'
          )
          AND to_tsvector('simple', CONCAT_WS(' ', eb."title", eb."content", eb."organization", eb."role_title"))
            @@ websearch_to_tsquery('simple', ${textSearchQuery})
        LIMIT ${candidateLimit}
      ),
      fused AS (
        SELECT COALESCE(v."id", t."id") AS id,
          COALESCE(1.0 / (60 + v.rank), 0) +
          COALESCE(1.0 / (60 + t.rank), 0) AS score
        FROM vector_ranked v FULL OUTER JOIN text_ranked t ON t."id" = v."id"
      )
      SELECT eb."id",
        (
          fused.score +
          CASE WHEN EXISTS (
            SELECT 1 FROM "question_on_brick" preferred
            WHERE preferred."question_id" = ${question.id}
              AND preferred."brick_id" = eb."id"
              AND preferred."is_selected" = true
          ) THEN 0.02 ELSE 0 END
        )::double precision AS "score",
        EXISTS (
          SELECT 1 FROM "question_on_brick" preferred
          WHERE preferred."question_id" = ${question.id}
            AND preferred."brick_id" = eb."id"
            AND preferred."is_selected" = true
        ) AS "isPreferred"
      FROM fused
      JOIN "experience_brick" eb ON eb."id" = fused.id
      WHERE eb."user_id" = ${input.userId}
      ORDER BY "score" DESC, eb."id" ASC
      LIMIT ${limit}
    `),
    prisma.$queryRaw<FactRow[]>(Prisma.sql`
      WITH vector_ranked AS (
        SELECT cf."id", ROW_NUMBER() OVER (
          ORDER BY cf."embedding" <=> ${vectorLiteral}::vector
        ) AS rank
        FROM "career_fact" cf
        WHERE cf."user_id" = ${input.userId}
          AND cf."active" = true
          AND cf."trust_status" = 'TRUSTED'
          AND EXISTS (
            SELECT 1 FROM "experience_brick" trusted_experience
            WHERE trusted_experience."id" = cf."experience_id"
              AND trusted_experience."user_id" = ${input.userId}
              AND trusted_experience."memory_status" = 'CONFIRMED'
              AND trusted_experience."embedded_revision" = trusted_experience."embedding_revision"
          )
          AND cf."embedding" IS NOT NULL
          AND cf."embedding_content_hash" IS NOT NULL
          AND cf."embedding_model" = ${AI_MODELS.EMBEDDING}
        ORDER BY cf."embedding" <=> ${vectorLiteral}::vector
        LIMIT ${candidateLimit}
      ),
      text_ranked AS (
        SELECT cf."id", ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector('simple', cf."value"),
            websearch_to_tsquery('simple', ${textSearchQuery})
          ) DESC
        ) AS rank
        FROM "career_fact" cf
        WHERE cf."user_id" = ${input.userId}
          AND cf."active" = true
          AND cf."trust_status" = 'TRUSTED'
          AND EXISTS (
            SELECT 1 FROM "experience_brick" trusted_experience
            WHERE trusted_experience."id" = cf."experience_id"
              AND trusted_experience."user_id" = ${input.userId}
              AND trusted_experience."memory_status" = 'CONFIRMED'
          )
          AND to_tsvector('simple', cf."value") @@ websearch_to_tsquery('simple', ${textSearchQuery})
        LIMIT ${candidateLimit}
      ),
      fused AS (
        SELECT COALESCE(v."id", t."id") AS id,
          COALESCE(1.0 / (60 + v.rank), 0) +
          COALESCE(1.0 / (60 + t.rank), 0) AS score
        FROM vector_ranked v FULL OUTER JOIN text_ranked t ON t."id" = v."id"
      )
      SELECT cf."id", cf."experience_id" AS "experienceId", cf."kind",
        cf."field_path" AS "fieldPath", cf."value",
        (
          fused.score +
          CASE WHEN EXISTS (
            SELECT 1 FROM "question_on_brick" preferred
            WHERE preferred."question_id" = ${question.id}
              AND preferred."brick_id" = cf."experience_id"
              AND preferred."is_selected" = true
          ) THEN 0.02 ELSE 0 END
        )::double precision AS "score"
      FROM fused
      JOIN "career_fact" cf ON cf."id" = fused.id
      WHERE cf."user_id" = ${input.userId}
        AND cf."active" = true
        AND cf."trust_status" = 'TRUSTED'
        AND EXISTS (
          SELECT 1 FROM "experience_brick" trusted_experience
          WHERE trusted_experience."id" = cf."experience_id"
            AND trusted_experience."user_id" = ${input.userId}
            AND trusted_experience."memory_status" = 'CONFIRMED'
        )
      ORDER BY "score" DESC, cf."id" ASC
      LIMIT ${limit}
    `),
  ]);

  const trustedExperienceFacts = experiences.length
    ? await prisma.careerFact.findMany({
        where: {
          userId: input.userId,
          active: true,
          trustStatus: "TRUSTED",
          experienceId: { in: experiences.map((experience) => experience.id) },
          experience: { memoryStatus: "CONFIRMED" },
        },
        select: {
          id: true,
          userId: true,
          experienceId: true,
          kind: true,
          fieldPath: true,
          value: true,
          active: true,
          trustStatus: true,
          experience: { select: { memoryStatus: true } },
        },
        orderBy: [{ experienceId: "asc" }, { fieldPath: "asc" }],
      })
    : [];
  const trustedExperiences = projectTrustedCareerExperiences({
    userId: input.userId,
    rankings: experiences,
    facts: trustedExperienceFacts.map((fact) => ({
      ...fact,
      experienceStatus: fact.experience.memoryStatus,
    })),
  });

  return {
    question,
    query,
    memoryVersion: user.careerMemoryVersion,
    preferredExperienceIds,
    experiences: trustedExperiences,
    facts: facts.map((fact) => ({
      id: fact.id,
      experienceId: fact.experienceId,
      kind: fact.kind,
      fieldPath: fact.fieldPath,
      value: fact.value,
      score: Number(fact.score),
    })),
  };
}

export type CareerVerificationClaim = {
  claim: string;
  riskCategory: "NUMBER" | "DATE" | "ORGANIZATION" | "TITLE" | "OTHER";
};

export type RetrievedCareerVerificationFact = {
  id: string;
  userId: string;
  experienceId: string;
  kind: CareerFactKind;
  fieldPath: string;
  value: string;
  active: boolean;
  trustStatus: string;
  experienceStatus: string;
};

function verificationTerms(value: string) {
  return new Set(
    (value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ??
      []).filter((term) => term.length > 1),
  );
}

export async function retrieveTrustedCareerFactsForClaims(input: {
  userId: string;
  claims: readonly CareerVerificationClaim[];
  exactGroundedFactIds?: readonly string[];
  limit?: number;
}): Promise<RetrievedCareerVerificationFact[]> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 60));
  const candidates = await prisma.careerFact.findMany({
    where: {
      userId: input.userId,
      active: true,
      trustStatus: "TRUSTED",
      experience: {
        userId: input.userId,
        memoryStatus: "CONFIRMED",
      },
    },
    select: {
      id: true,
      userId: true,
      experienceId: true,
      kind: true,
      fieldPath: true,
      value: true,
      active: true,
      trustStatus: true,
      experience: { select: { memoryStatus: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });
  const claimTerms = input.claims.map((claim) => verificationTerms(claim.claim));
  const grounded = new Set(input.exactGroundedFactIds ?? []);
  const rankedById = new Map<
    string,
    { fact: (typeof candidates)[number]; score: number }
  >();
  for (const terms of claimTerms) {
    const perClaim = candidates
      .map((fact) => {
        const valueTerms = verificationTerms(fact.value);
        let score = 0;
        for (const term of terms) {
          if (valueTerms.has(term)) score += 1;
        }
        return { fact, score };
      })
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.fact.id.localeCompare(right.fact.id),
      )
      .slice(0, 20);
    for (const item of perClaim) {
      const previous = rankedById.get(item.fact.id);
      if (!previous || item.score > previous.score) {
        rankedById.set(item.fact.id, item);
      }
    }
  }
  for (const fact of candidates) {
    if (!grounded.has(fact.id)) continue;
    const previous = rankedById.get(fact.id);
    rankedById.set(fact.id, {
      fact,
      score: Math.max(previous?.score ?? 0, 100),
    });
  }
  return [...rankedById.values()]
    .map(({ fact, score }) => {
      const valueTerms = verificationTerms(fact.value);
      return {
        fact,
        score:
          score +
          (grounded.has(fact.id) ? 100 : 0) +
          Math.min(valueTerms.size, 1) * 0.001,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.fact.id.localeCompare(right.fact.id),
    )
    .slice(0, limit)
    .map(({ fact }) => ({
      id: fact.id,
      userId: fact.userId,
      experienceId: fact.experienceId,
      kind: fact.kind,
      fieldPath: fact.fieldPath,
      value: fact.value,
      active: fact.active,
      trustStatus: fact.trustStatus,
      experienceStatus: fact.experience.memoryStatus,
    }));
}
