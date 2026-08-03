import { Prisma } from "@prisma/client";

import {
  projectTrustedCareerExperiences,
  type TrustedCareerExperience,
} from "@/domain/career-memory/careerTrustedGeneration";

import { AI_MODELS } from "@/lib/constants/ai";
import { getEmbedding } from "@/lib/llm/embedding";
import { prisma } from "@/lib/prisma";

export type RankedBrick = TrustedCareerExperience;

type RankedBrickRow = { id: string; score: number };

export async function rankBricksForQuestion(params: {
  questionText: string;
  userId: string;
  teamId: string;
  topK?: number;
}): Promise<RankedBrick[]> {
  const query = params.questionText.trim();
  if (!query) return [];
  const embedding = await getEmbedding(query);
  if (embedding.length === 0) return [];
  const vectorLiteral = `[${embedding.join(",")}]`;
  const limit = Math.min(20, Math.max(1, params.topK ?? 10));
  const candidateLimit = Math.max(20, limit * 4);
  const rows = await prisma.$queryRaw<RankedBrickRow[]>(Prisma.sql`
    WITH vector_ranked AS (
      SELECT eb."id", ROW_NUMBER() OVER (
        ORDER BY eb."embedding" <=> ${vectorLiteral}::vector
      ) AS rank
      FROM "experience_brick" eb
      WHERE eb."user_id" = ${params.userId}
        AND eb."memory_status" = 'CONFIRMED'
        AND EXISTS (
          SELECT 1 FROM "career_fact" trusted_fact
          WHERE trusted_fact."experience_id" = eb."id"
            AND trusted_fact."user_id" = ${params.userId}
            AND trusted_fact."active" = true
            AND trusted_fact."trust_status" = 'TRUSTED'
        )
        AND eb."embedding" IS NOT NULL
        AND eb."embedding_content_hash" IS NOT NULL
        AND eb."embedding_model" = ${AI_MODELS.EMBEDDING}
      ORDER BY eb."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${candidateLimit}
    ),
    text_ranked AS (
      SELECT eb."id", ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(
          to_tsvector('simple', CONCAT_WS(' ', eb."title", eb."content")),
          plainto_tsquery('simple', ${query})
        ) DESC
      ) AS rank
      FROM "experience_brick" eb
      WHERE eb."user_id" = ${params.userId}
        AND eb."memory_status" = 'CONFIRMED'
        AND EXISTS (
          SELECT 1 FROM "career_fact" trusted_fact
          WHERE trusted_fact."experience_id" = eb."id"
            AND trusted_fact."user_id" = ${params.userId}
            AND trusted_fact."active" = true
            AND trusted_fact."trust_status" = 'TRUSTED'
        )
        AND eb."embedding" IS NOT NULL
        AND eb."embedding_content_hash" IS NOT NULL
        AND eb."embedding_model" = ${AI_MODELS.EMBEDDING}
        AND to_tsvector('simple', CONCAT_WS(' ', eb."title", eb."content"))
          @@ plainto_tsquery('simple', ${query})
      LIMIT ${candidateLimit}
    ),
    fused AS (
      SELECT COALESCE(v."id", t."id") AS id,
        COALESCE(1.0 / (60 + v.rank), 0) +
        COALESCE(1.0 / (60 + t.rank), 0) AS score
      FROM vector_ranked v FULL OUTER JOIN text_ranked t ON t."id" = v."id"
    )
    SELECT eb."id", fused.score::double precision AS "score"
    FROM fused
    JOIN "experience_brick" eb ON eb."id" = fused.id
    WHERE eb."user_id" = ${params.userId}
    ORDER BY fused.score DESC, eb."id" ASC
    LIMIT ${limit}
  `);
  const facts = rows.length
    ? await prisma.careerFact.findMany({
        where: {
          userId: params.userId,
          active: true,
          trustStatus: "TRUSTED",
          experienceId: { in: rows.map((row) => row.id) },
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
  return projectTrustedCareerExperiences({
    userId: params.userId,
    rankings: rows.map((row) => ({ id: row.id, score: Number(row.score) })),
    facts: facts.map((fact) => ({
      ...fact,
      experienceStatus: fact.experience.memoryStatus,
    })),
  });
}
