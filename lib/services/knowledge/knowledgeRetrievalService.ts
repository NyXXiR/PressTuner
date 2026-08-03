import { KnowledgeChunkRole, Prisma } from "@prisma/client";

import {
  buildGroundedRetrieval,
  type KnowledgeRetrievalHit,
} from "@/domain/knowledge/retrieval";
import { getEmbedding } from "@/lib/llm/embedding";
import { prisma } from "@/lib/prisma";

type HybridRow = {
  teamId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  score: number;
  automaticRole: KnowledgeChunkRole | null;
  documentOverride: KnowledgeChunkRole | null;
};

type KnowledgeQueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function prepareKnowledgeQuery(queryInput: string) {
  const query = queryInput.trim();
  if (!query) return { query: "", embedding: [] as number[] };
  return { query, embedding: await getEmbedding(query) };
}

export async function searchKnowledgeWithPreparedQuery(
  client: KnowledgeQueryClient,
  args: {
    teamId: string;
    query: string;
    embedding: readonly number[];
    topK?: number;
    documentIds?: readonly string[];
    roles?: readonly KnowledgeChunkRole[];
  },
) {
  const query = args.query.trim();
  if (!args.teamId.trim()) throw new Error("KNOWLEDGE_TEAM_REQUIRED");
  if (!query || args.embedding.length === 0) {
    return { context: "", citations: [], hits: [] };
  }

  const embedding = args.embedding;
  const limit = Math.min(20, Math.max(1, args.topK ?? 8));
  const candidateLimit = Math.max(limit * 4, 20);
  const roles: KnowledgeChunkRole[] =
    args.roles && args.roles.length > 0
      ? [...new Set(args.roles)]
      : [KnowledgeChunkRole.FACT];
  const roleFilter = Prisma.sql`
    AND COALESCE(kd."classification_override", kc."auto_role")
      IN (${Prisma.join(
        roles.map(
          (role) => Prisma.sql`${role}::"KnowledgeChunkRole"`,
        ),
      )})
  `;
  const vectorLiteral = `[${embedding.join(",")}]`;
  const documentFilter =
    args.documentIds && args.documentIds.length > 0
      ? Prisma.sql`AND kc."document_id" IN (${Prisma.join(args.documentIds)})`
      : Prisma.empty;
  const lifecyclePredicate = Prisma.sql`
    AND kd."deleted_at" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "knowledge_document" successor
      WHERE successor."replaces_document_id" = kd."id"
        AND successor."team_id" = ${args.teamId}
        AND successor."deleted_at" IS NULL
        AND successor."status" = 'READY'
    )
  `;

  const rows = await client.$queryRaw<HybridRow[]>(Prisma.sql`
    WITH vector_ranked AS (
      SELECT
        kc."id",
        ROW_NUMBER() OVER (
          ORDER BY kc."embedding" <=> ${vectorLiteral}::vector
        ) AS rank
      FROM "knowledge_chunk" kc
      JOIN "knowledge_document" kd
        ON kd."id" = kc."document_id" AND kd."team_id" = ${args.teamId}
      WHERE kc."team_id" = ${args.teamId}
        AND kd."status" = 'READY'
        AND kc."generation_id" = kd."active_generation_id"
        ${lifecyclePredicate}
        ${roleFilter}
        AND kc."embedding" IS NOT NULL
        ${documentFilter}
      ORDER BY kc."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${candidateLimit}
    ),
    text_ranked AS (
      SELECT
        kc."id",
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector('simple', kc."content"),
            plainto_tsquery('simple', ${query})
          ) DESC
        ) AS rank
      FROM "knowledge_chunk" kc
      JOIN "knowledge_document" kd
        ON kd."id" = kc."document_id" AND kd."team_id" = ${args.teamId}
      WHERE kc."team_id" = ${args.teamId}
        AND kd."status" = 'READY'
        AND kc."generation_id" = kd."active_generation_id"
        ${lifecyclePredicate}
        ${roleFilter}
        AND to_tsvector('simple', kc."content")
          @@ plainto_tsquery('simple', ${query})
        ${documentFilter}
      ORDER BY ts_rank_cd(
        to_tsvector('simple', kc."content"),
        plainto_tsquery('simple', ${query})
      ) DESC
      LIMIT ${candidateLimit}
    ),
    fused AS (
      SELECT
        COALESCE(vr."id", tr."id") AS id,
        COALESCE(1.0 / (60 + vr.rank), 0) +
        COALESCE(1.0 / (60 + tr.rank), 0) AS score
      FROM vector_ranked vr
      FULL OUTER JOIN text_ranked tr ON tr."id" = vr."id"
    )
    SELECT
      kc."team_id" AS "teamId",
      kc."id" AS "chunkId",
      kc."document_id" AS "documentId",
      kd."original_name" AS "documentName",
      kc."page_start" AS "pageStart",
      kc."page_end" AS "pageEnd",
      kc."content",
      kc."auto_role" AS "automaticRole",
      kd."classification_override" AS "documentOverride",
      fused.score::double precision AS "score"
    FROM fused
    JOIN "knowledge_chunk" kc ON kc."id" = fused.id
    JOIN "knowledge_document" kd
      ON kd."id" = kc."document_id" AND kd."team_id" = ${args.teamId}
    WHERE kd."status" = 'READY'
      AND kc."generation_id" = kd."active_generation_id"
      ${lifecyclePredicate}
      ${roleFilter}
    ORDER BY fused.score DESC
    LIMIT ${limit}
  `);

  const hits: KnowledgeRetrievalHit[] = rows.map((row) => ({
    ...row,
    score: Number(row.score),
  }));
  return {
    ...buildGroundedRetrieval({
      activeTeamId: args.teamId,
      hits,
      requestedRoles: roles,
    }),
    hits,
  };
}

export async function searchKnowledge(args: {
  teamId: string;
  query: string;
  topK?: number;
  documentIds?: readonly string[];
  roles?: readonly KnowledgeChunkRole[];
}) {
  const prepared = await prepareKnowledgeQuery(args.query);
  return searchKnowledgeWithPreparedQuery(prisma, {
    ...args,
    ...prepared,
  });
}
