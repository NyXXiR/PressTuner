import { createHash } from "node:crypto";

import {
  effectiveKnowledgeRole,
  type KnowledgeChunkRole,
} from "./classification";

export type KnowledgeRetrievalPolicy = {
  version: "press-knowledge-scope-v1";
  teamId: string;
  allowedDocumentStatuses: readonly ["READY"];
  requireActiveGeneration: true;
  allowedRoles: KnowledgeChunkRole[];
  documentIds: string[] | null;
};

export function buildKnowledgeRetrievalPolicy(args: {
  teamId: string;
  roles: readonly KnowledgeChunkRole[];
  documentIds?: readonly string[];
}): KnowledgeRetrievalPolicy {
  const teamId = args.teamId.trim();
  if (!teamId) throw new Error("KNOWLEDGE_TEAM_REQUIRED");
  const allowedRoles = [...new Set(args.roles)];
  if (allowedRoles.length === 0) throw new Error("KNOWLEDGE_ROLE_REQUIRED");
  const documentIds = args.documentIds
    ? [...new Set(args.documentIds.map((id) => id.trim()).filter(Boolean))].sort()
    : null;
  return {
    version: "press-knowledge-scope-v1",
    teamId,
    allowedDocumentStatuses: ["READY"],
    requireActiveGeneration: true,
    allowedRoles,
    documentIds: documentIds && documentIds.length > 0 ? documentIds : null,
  };
}

export type KnowledgeQueryMode =
  | "ORIGINAL"
  | "DETERMINISTIC_NORMALIZATION"
  | "IDENTIFIER_AWARE_NORMALIZATION"
  | "MODEL_REWRITE";

export type KnowledgeQueryPlan = {
  version: "knowledge-query-plan-v1";
  mode: KnowledgeQueryMode;
  originalQuery: string;
  executedQuery: string;
  model: string | null;
  usage?: Readonly<{
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
  }> | null;
};

function normalizeKnowledgeQuery(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function extractExplicitKnowledgeIdentifiers(value: string): string[] {
  return [
    ...new Set(
      normalizeKnowledgeQuery(value).match(
        /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}\b/g,
      ) ?? [],
    ),
  ];
}

export function buildKnowledgeQueryPlan(args: {
  query: string;
  mode?: KnowledgeQueryMode;
  rewrittenQuery?: string;
  model?: string;
}): KnowledgeQueryPlan {
  const originalQuery = args.query.trim();
  const mode = args.mode ?? "ORIGINAL";
  let executedQuery = originalQuery;
  let model: string | null = null;

  if (
    mode === "DETERMINISTIC_NORMALIZATION" ||
    mode === "IDENTIFIER_AWARE_NORMALIZATION"
  ) {
    executedQuery = normalizeKnowledgeQuery(originalQuery);
    if (mode === "IDENTIFIER_AWARE_NORMALIZATION") {
      const identifiers = extractExplicitKnowledgeIdentifiers(executedQuery);
      if (identifiers.length > 0) {
        executedQuery = identifiers.join(" ");
      }
    }
  } else if (mode === "MODEL_REWRITE") {
    executedQuery = normalizeKnowledgeQuery(args.rewrittenQuery ?? "");
    model = args.model?.trim() || null;
    if (!executedQuery || !model) {
      throw new Error("KNOWLEDGE_QUERY_REWRITE_REQUIRED");
    }
  }
  return {
    version: "knowledge-query-plan-v1",
    mode,
    originalQuery,
    executedQuery,
    model,
  };
}

export type RetrievalExclusionReason =
  | "ROLE_NOT_ALLOWED"
  | "DUPLICATE_CONTENT"
  | "TOKEN_BUDGET_EXCEEDED"
  | "DOCUMENT_LIMIT_REACHED"
  | "MAX_SELECTED_REACHED";

export type AuditableKnowledgeCandidate = {
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
  vectorRank: number | null;
  vectorScore: number | null;
  lexicalRank: number | null;
  lexicalScore: number | null;
  fusedRank: number;
  fusedScore: number;
  rerankScore: number | null;
  selected: boolean;
  exclusionReason: RetrievalExclusionReason | null;
};

export type KnowledgeReranker =
  | { version: "NONE" }
  | {
      version: string;
      scoreBatch: (
        candidates: readonly Readonly<AuditableKnowledgeCandidate>[],
      ) => Promise<Readonly<Record<string, number>>>;
      getUsage: () => Readonly<{
        inputTokens: number;
        outputTokens: number;
        costMicros: number;
      }> | null;
    };

export type KnowledgePackingPolicy = {
  maxSelected: number;
  tokenBudget: number;
  maxPerDocument: number;
};

function normalizedContentHash(content: string) {
  return createHash("sha256")
    .update(content.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex");
}

function estimatedTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

function rankingScore(candidate: AuditableKnowledgeCandidate) {
  return candidate.rerankScore ?? candidate.fusedScore;
}

export async function finalizeKnowledgeRetrieval(args: {
  activeTeamId: string;
  requestedRoles: readonly KnowledgeChunkRole[];
  candidates: readonly AuditableKnowledgeCandidate[];
  reranker: KnowledgeReranker;
  packing: KnowledgePackingPolicy;
}): Promise<{
  selected: AuditableKnowledgeCandidate[];
  candidates: AuditableKnowledgeCandidate[];
  identity: {
    version: "auditable-knowledge-retrieval-v1";
    dedupe: "normalized-content-newest-source-v1";
    reranker: string;
    packing: "token-role-document-diversity-v1";
  };
  stageMetrics: {
    dedupeMs: number;
    rerankingMs: number;
    contextPackingMs: number;
  };
  componentCostMicros: { reranking: number | null };
}> {
  if (!args.activeTeamId.trim()) throw new Error("KNOWLEDGE_TEAM_REQUIRED");
  if (
    args.packing.maxSelected <= 0 ||
    args.packing.tokenBudget <= 0 ||
    args.packing.maxPerDocument <= 0
  ) {
    throw new Error("KNOWLEDGE_PACKING_POLICY_INVALID");
  }

  const candidates: AuditableKnowledgeCandidate[] = args.candidates.map(
    (candidate) => ({
      ...candidate,
      rerankScore: null,
      selected: false,
      exclusionReason: null,
    }),
  );
  for (const candidate of candidates) {
    if (candidate.teamId !== args.activeTeamId) {
      throw new Error("KNOWLEDGE_TEAM_SCOPE_VIOLATION");
    }
  }

  const eligible = candidates.filter((candidate) => {
    const role = effectiveKnowledgeRole(candidate);
    if (!role || !args.requestedRoles.includes(role)) {
      candidate.exclusionReason = "ROLE_NOT_ALLOWED";
      return false;
    }
    return true;
  });

  const dedupeStartedAt = performance.now();
  const contentGroups = new Map<string, AuditableKnowledgeCandidate[]>();
  for (const candidate of eligible) {
    const key = normalizedContentHash(candidate.content);
    const group = contentGroups.get(key) ?? [];
    group.push(candidate);
    contentGroups.set(key, group);
  }
  const deduped: AuditableKnowledgeCandidate[] = [];
  for (const group of contentGroups.values()) {
    group.sort(
      (left, right) =>
        right.sourceVersion - left.sourceVersion ||
        left.fusedRank - right.fusedRank ||
        left.chunkId.localeCompare(right.chunkId),
    );
    const [winner, ...duplicates] = group;
    if (winner) deduped.push(winner);
    duplicates.forEach((candidate) => {
      candidate.exclusionReason = "DUPLICATE_CONTENT";
    });
  }
  const dedupeMs = performance.now() - dedupeStartedAt;

  const rerankingStartedAt = performance.now();
  if ("scoreBatch" in args.reranker) {
    const scores = await args.reranker.scoreBatch(deduped);
    for (const candidate of deduped) {
      const score = scores[candidate.chunkId];
      if (!Number.isFinite(score)) {
        throw new Error("KNOWLEDGE_RERANK_SCORE_INVALID");
      }
      candidate.rerankScore = score!;
    }
  }
  deduped.sort(
    (left, right) =>
      rankingScore(right) - rankingScore(left) ||
      left.fusedRank - right.fusedRank ||
      left.chunkId.localeCompare(right.chunkId),
  );
  const rerankingMs = performance.now() - rerankingStartedAt;

  const packingStartedAt = performance.now();
  const perDocument = new Map<string, number>();
  let usedTokens = 0;
  const selected: AuditableKnowledgeCandidate[] = [];
  for (const candidate of deduped) {
    if (selected.length >= args.packing.maxSelected) {
      candidate.exclusionReason = "MAX_SELECTED_REACHED";
      continue;
    }
    const documentCount = perDocument.get(candidate.documentId) ?? 0;
    if (documentCount >= args.packing.maxPerDocument) {
      candidate.exclusionReason = "DOCUMENT_LIMIT_REACHED";
      continue;
    }
    const tokens = estimatedTokens(candidate.content);
    if (usedTokens + tokens > args.packing.tokenBudget) {
      candidate.exclusionReason = "TOKEN_BUDGET_EXCEEDED";
      continue;
    }
    candidate.selected = true;
    candidate.exclusionReason = null;
    selected.push(candidate);
    usedTokens += tokens;
    perDocument.set(candidate.documentId, documentCount + 1);
  }
  const contextPackingMs = performance.now() - packingStartedAt;

  return {
    selected,
    candidates,
    identity: {
      version: "auditable-knowledge-retrieval-v1",
      dedupe: "normalized-content-newest-source-v1",
      reranker: args.reranker.version,
      packing: "token-role-document-diversity-v1",
    },
    stageMetrics: { dedupeMs, rerankingMs, contextPackingMs },
    componentCostMicros: {
      reranking:
        "getUsage" in args.reranker
          ? (args.reranker.getUsage()?.costMicros ?? null)
          : 0,
    },
  };
}
