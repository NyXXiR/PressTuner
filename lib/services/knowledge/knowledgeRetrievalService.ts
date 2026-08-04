import { KnowledgeChunkRole, Prisma } from "@prisma/client";

import {
  buildGroundedRetrieval,
  type KnowledgeRetrievalHit,
} from "@/domain/knowledge/retrieval";
import {
  type AuditableKnowledgeCandidate,
  buildKnowledgeQueryPlan,
  buildKnowledgeRetrievalPolicy,
  finalizeKnowledgeRetrieval,
  type KnowledgeQueryPlan,
} from "@/domain/knowledge/retrievalPipeline";
import {
  PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME,
  resolvePressKnowledgeRetrievalConfiguration,
  type PressKnowledgeRetrievalConfiguration,
  resolvePressKnowledgeRetrievalLimits,
} from "@/domain/knowledge/retrievalRuntime";
import { getEmbedding } from "@/lib/llm/embedding";
import { prisma } from "@/lib/prisma";
import {
  transformKnowledgeQuery,
  type KnowledgeQueryRewriter,
} from "./knowledgeQueryTransformationService";
import {
  createKnowledgeReranker,
  type KnowledgeListwiseRanker,
} from "./knowledgeRerankerService";

type HybridRow = {
  teamId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  sourceVersion: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  automaticRole: KnowledgeChunkRole | null;
  documentOverride: KnowledgeChunkRole | null;
  vectorRank: number | bigint | null;
  vectorScore: number | null;
  lexicalRank: number | bigint | null;
  lexicalScore: number | null;
  fusedRank: number | bigint;
  fusedScore: number;
};

type KnowledgeQueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

function nullableNumber(value: number | bigint | null) {
  return value === null ? null : Number(value);
}

export async function prepareKnowledgeQuery(
  queryInput: string,
  options?: Readonly<{
    configuration?: PressKnowledgeRetrievalConfiguration;
    rewrite?: KnowledgeQueryRewriter;
  }>,
) {
  const configuration =
    options?.configuration ?? resolvePressKnowledgeRetrievalConfiguration();
  const transformStartedAt = performance.now();
  const queryPlan = await transformKnowledgeQuery({
    query: queryInput,
    configuration,
    rewrite: options?.rewrite,
  });
  const queryTransformationMs = performance.now() - transformStartedAt;
  const query = queryPlan.executedQuery;
  if (!query) {
    return {
      query: "",
      embedding: [] as number[],
      queryPlan,
      configuration,
      preparationStageMetrics: { queryTransformationMs, queryEmbeddingMs: 0 },
      preparationComponentCostMicros: {
        queryEmbedding: 0,
        queryRewrite: queryPlan.mode === "MODEL_REWRITE"
          ? ((queryPlan as KnowledgeQueryPlan & { usage?: { costMicros: number } | null }).usage?.costMicros ?? null)
          : 0,
      },
    };
  }
  const embeddingStartedAt = performance.now();
  const embedding = await getEmbedding(query);
  return {
    query,
    embedding,
    queryPlan,
    configuration,
    preparationStageMetrics: {
      queryTransformationMs,
      queryEmbeddingMs: performance.now() - embeddingStartedAt,
    },
    preparationComponentCostMicros: {
      queryEmbedding: Math.max(1, Math.ceil(Math.ceil(query.length / 4) * 0.02)),
      queryRewrite: queryPlan.mode === "MODEL_REWRITE"
        ? ((queryPlan as KnowledgeQueryPlan & { usage?: { costMicros: number } | null }).usage?.costMicros ?? null)
        : 0,
    },
  };
}

export async function searchKnowledgeWithPreparedQuery(
  client: KnowledgeQueryClient,
  args: {
    teamId: string;
    query: string;
    embedding: readonly number[];
    queryPlan?: KnowledgeQueryPlan;
    topK?: number;
    contextTokenBudget?: number;
    maxPerDocument?: number;
    documentIds?: readonly string[];
    roles?: readonly KnowledgeChunkRole[];
    configuration?: PressKnowledgeRetrievalConfiguration;
    rerank?: KnowledgeListwiseRanker;
    preparationStageMetrics?: {
      queryTransformationMs: number;
      queryEmbeddingMs: number;
    };
    preparationComponentCostMicros?: {
      queryEmbedding: number;
      queryRewrite: number | null;
    };
  },
) {
  const roles: KnowledgeChunkRole[] =
    args.roles && args.roles.length > 0
      ? [...new Set(args.roles)]
      : [KnowledgeChunkRole.FACT];
  const policy = buildKnowledgeRetrievalPolicy({
    teamId: args.teamId,
    roles,
    documentIds: args.documentIds,
  });
  const query = args.query.trim();
  const queryPlan =
    args.queryPlan ?? buildKnowledgeQueryPlan({ query, mode: "ORIGINAL" });
  if (queryPlan.executedQuery !== query) {
    throw new Error("KNOWLEDGE_QUERY_PLAN_MISMATCH");
  }
  if (!query || args.embedding.length === 0) {
    return {
      context: "",
      citations: [],
      hits: [],
      trace: [] as AuditableKnowledgeCandidate[],
      queryPlan,
      policy,
      retrievalIdentity: null,
      stageMetrics: {
        ...(args.preparationStageMetrics ?? {
          queryTransformationMs: 0,
          queryEmbeddingMs: 0,
        }),
        combinedHybridSqlRetrievalMs: 0,
        dedupeMs: 0,
        rerankingMs: 0,
        contextPackingMs: 0,
      },
      componentCostMicros: {
        ...(args.preparationComponentCostMicros ?? { queryEmbedding: null, queryRewrite: null }),
        reranking: 0,
      },
    };
  }

  const embedding = args.embedding;
  const { limit, candidateLimit } = resolvePressKnowledgeRetrievalLimits(args.topK);
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
    policy.documentIds && policy.documentIds.length > 0
      ? Prisma.sql`AND kc."document_id" IN (${Prisma.join(policy.documentIds)})`
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

  const retrievalStartedAt = performance.now();
  const rows = await client.$queryRaw<HybridRow[]>(Prisma.sql`
    WITH vector_ranked AS (
      SELECT
        kc."id",
        kc."embedding" <=> ${vectorLiteral}::vector AS distance,
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
        ts_rank_cd(
          to_tsvector('simple', kc."content"),
          plainto_tsquery('simple', ${query})
        ) AS score,
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
        vr.rank AS vector_rank,
        CASE WHEN vr.distance IS NULL THEN NULL ELSE 1.0 - vr.distance END AS vector_score,
        tr.rank AS lexical_rank,
        tr.score AS lexical_score,
        COALESCE(1.0 / (${PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME.rrfK} + vr.rank), 0) +
        COALESCE(1.0 / (${PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME.rrfK} + tr.rank), 0) AS fused_score
      FROM vector_ranked vr
      FULL OUTER JOIN text_ranked tr ON tr."id" = vr."id"
    ),
    ranked AS (
      SELECT
        fused.*,
        ROW_NUMBER() OVER (ORDER BY fused.fused_score DESC, fused.id ASC) AS fused_rank
      FROM fused
    )
    SELECT
      kc."team_id" AS "teamId",
      kc."id" AS "chunkId",
      kc."document_id" AS "documentId",
      kd."original_name" AS "documentName",
      kd."source_version" AS "sourceVersion",
      kc."page_start" AS "pageStart",
      kc."page_end" AS "pageEnd",
      kc."content",
      kc."auto_role" AS "automaticRole",
      kd."classification_override" AS "documentOverride",
      ranked.vector_rank AS "vectorRank",
      ranked.vector_score::double precision AS "vectorScore",
      ranked.lexical_rank AS "lexicalRank",
      ranked.lexical_score::double precision AS "lexicalScore",
      ranked.fused_rank AS "fusedRank",
      ranked.fused_score::double precision AS "fusedScore"
    FROM ranked
    JOIN "knowledge_chunk" kc ON kc."id" = ranked.id
    JOIN "knowledge_document" kd
      ON kd."id" = kc."document_id" AND kd."team_id" = ${args.teamId}
    WHERE kd."status" = 'READY'
      AND kc."generation_id" = kd."active_generation_id"
      ${lifecyclePredicate}
      ${roleFilter}
    ORDER BY ranked.fused_score DESC, ranked.id ASC
    LIMIT ${candidateLimit}
  `);
  const combinedHybridSqlRetrievalMs = performance.now() - retrievalStartedAt;

  const candidates: AuditableKnowledgeCandidate[] = rows.map((row) => ({
    teamId: row.teamId,
    chunkId: row.chunkId,
    documentId: row.documentId,
    documentName: row.documentName,
    sourceVersion: Number(row.sourceVersion),
    pageStart: row.pageStart,
    pageEnd: row.pageEnd,
    content: row.content,
    automaticRole: row.automaticRole,
    documentOverride: row.documentOverride,
    vectorRank: nullableNumber(row.vectorRank),
    vectorScore: nullableNumber(row.vectorScore),
    lexicalRank: nullableNumber(row.lexicalRank),
    lexicalScore: nullableNumber(row.lexicalScore),
    fusedRank: Number(row.fusedRank),
    fusedScore: Number(row.fusedScore),
    rerankScore: null,
    selected: false,
    exclusionReason: null,
  }));
  const finalized = await finalizeKnowledgeRetrieval({
    activeTeamId: args.teamId,
    requestedRoles: roles,
    candidates,
    reranker: createKnowledgeReranker({
      query,
      configuration:
        args.configuration ?? resolvePressKnowledgeRetrievalConfiguration(),
      rank: args.rerank,
    }),
    packing: {
      maxSelected: limit,
      tokenBudget: args.contextTokenBudget ?? 6_000,
      maxPerDocument: args.maxPerDocument ?? 2,
    },
  });
  const hits: KnowledgeRetrievalHit[] = finalized.selected.map((candidate) => ({
    teamId: candidate.teamId,
    chunkId: candidate.chunkId,
    documentId: candidate.documentId,
    documentName: candidate.documentName,
    pageStart: candidate.pageStart,
    pageEnd: candidate.pageEnd,
    content: candidate.content,
    score: candidate.rerankScore ?? candidate.fusedScore,
    automaticRole: candidate.automaticRole,
    documentOverride: candidate.documentOverride,
  }));
  return {
    ...buildGroundedRetrieval({
      activeTeamId: args.teamId,
      hits,
      requestedRoles: roles,
    }),
    hits,
    trace: finalized.candidates,
    queryPlan,
    policy,
    retrievalIdentity: finalized.identity,
    stageMetrics: {
      ...(args.preparationStageMetrics ?? {
        queryTransformationMs: 0,
        queryEmbeddingMs: 0,
      }),
      combinedHybridSqlRetrievalMs,
      ...finalized.stageMetrics,
    },
    componentCostMicros: {
      ...(args.preparationComponentCostMicros ?? { queryEmbedding: null, queryRewrite: null }),
      reranking: finalized.componentCostMicros.reranking,
    },
  };
}

export async function searchKnowledge(args: {
  teamId: string;
  query: string;
  topK?: number;
  contextTokenBudget?: number;
  maxPerDocument?: number;
  documentIds?: readonly string[];
  roles?: readonly KnowledgeChunkRole[];
  configurationId?: keyof typeof import("@/domain/knowledge/retrievalRuntime").PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS;
  rewrite?: KnowledgeQueryRewriter;
  rerank?: KnowledgeListwiseRanker;
}) {
  const configuration = resolvePressKnowledgeRetrievalConfiguration(
    args.configurationId,
  );
  const prepared = await prepareKnowledgeQuery(args.query, {
    configuration,
    rewrite: args.rewrite,
  });
  return searchKnowledgeWithPreparedQuery(prisma, {
    ...args,
    ...prepared,
    rerank: args.rerank,
  });
}
