import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnowledgeQueryPlan,
  buildKnowledgeRetrievalPolicy,
  finalizeKnowledgeRetrieval,
  type AuditableKnowledgeCandidate,
} from "./retrievalPipeline";

function candidate(
  overrides: Partial<AuditableKnowledgeCandidate> &
    Pick<AuditableKnowledgeCandidate, "chunkId" | "documentId" | "content">,
): AuditableKnowledgeCandidate {
  return {
    teamId: "team-a",
    documentName: `${overrides.documentId}.pdf`,
    sourceVersion: 1,
    pageStart: 1,
    pageEnd: 1,
    automaticRole: "FACT",
    documentOverride: null,
    vectorRank: null,
    vectorScore: null,
    lexicalRank: null,
    lexicalScore: null,
    fusedRank: 1,
    fusedScore: 0.1,
    rerankScore: null,
    selected: false,
    exclusionReason: null,
    ...overrides,
  };
}

test("retrieval policy requires tenant scope and freezes authorization filters outside query rewriting", () => {
  assert.throws(
    () =>
      buildKnowledgeRetrievalPolicy({
        teamId: " ",
        roles: ["FACT"],
      }),
    /KNOWLEDGE_TEAM_REQUIRED/,
  );

  const policy = buildKnowledgeRetrievalPolicy({
    teamId: "team-a",
    roles: ["FACT", "STYLE_POLICY", "FACT"],
    documentIds: ["doc-b", "doc-a", "doc-b"],
  });
  assert.deepEqual(policy, {
    version: "press-knowledge-scope-v1",
    teamId: "team-a",
    allowedDocumentStatuses: ["READY"],
    requireActiveGeneration: true,
    allowedRoles: ["FACT", "STYLE_POLICY"],
    documentIds: ["doc-a", "doc-b"],
  });
});

test("query planning records original and executed queries without carrying authorization filters", () => {
  assert.deepEqual(
    buildKnowledgeQueryPlan({
      query: "  PressTuner의　2026년   매출은?  ",
      mode: "DETERMINISTIC_NORMALIZATION",
    }),
    {
      version: "knowledge-query-plan-v1",
      mode: "DETERMINISTIC_NORMALIZATION",
      originalQuery: "PressTuner의　2026년   매출은?",
      executedQuery: "PressTuner의 2026년 매출은?",
      model: null,
    },
  );
  assert.deepEqual(
    buildKnowledgeQueryPlan({
      query: "매출 알려줘",
      mode: "MODEL_REWRITE",
      rewrittenQuery: "PressTuner 2026년 매출",
      model: "recorded-rewriter-v1",
    }),
    {
      version: "knowledge-query-plan-v1",
      mode: "MODEL_REWRITE",
      originalQuery: "매출 알려줘",
      executedQuery: "PressTuner 2026년 매출",
      model: "recorded-rewriter-v1",
    },
  );
  assert.throws(
    () =>
      buildKnowledgeQueryPlan({
        query: "매출",
        mode: "MODEL_REWRITE",
      }),
    /KNOWLEDGE_QUERY_REWRITE_REQUIRED/,
  );
});

test("candidate finalization keeps full stage traces and deduplicates normalized content in favor of newer sources", async () => {
  const result = await finalizeKnowledgeRetrieval({
    activeTeamId: "team-a",
    requestedRoles: ["FACT"],
    candidates: [
      candidate({
        chunkId: "old",
        documentId: "doc-old",
        sourceVersion: 1,
        content: "매출은 100억 원입니다.",
        fusedRank: 1,
        fusedScore: 0.5,
      }),
      candidate({
        chunkId: "new",
        documentId: "doc-new",
        sourceVersion: 2,
        content: "  매출은   100억 원입니다. ",
        fusedRank: 2,
        fusedScore: 0.4,
      }),
      candidate({
        chunkId: "other",
        documentId: "doc-other",
        content: "영업이익은 15억 원입니다.",
        fusedRank: 3,
        fusedScore: 0.3,
      }),
    ],
    reranker: { version: "NONE" },
    packing: { maxSelected: 2, tokenBudget: 100, maxPerDocument: 1 },
  });

  assert.deepEqual(result.selected.map((entry) => entry.chunkId), ["new", "other"]);
  const duplicate = result.candidates.find((entry) => entry.chunkId === "old");
  assert.equal(duplicate?.selected, false);
  assert.equal(duplicate?.exclusionReason, "DUPLICATE_CONTENT");
  assert.equal(result.identity.reranker, "NONE");
  assert.equal(result.identity.dedupe, "normalized-content-newest-source-v1");
});

test("pluggable reranking and context packing enforce role, tenant, diversity, and token exclusions", async () => {
  const result = await finalizeKnowledgeRetrieval({
    activeTeamId: "team-a",
    requestedRoles: ["FACT"],
    candidates: [
      candidate({
        chunkId: "a1",
        documentId: "doc-a",
        content: "A".repeat(80),
        fusedRank: 1,
        fusedScore: 0.5,
      }),
      candidate({
        chunkId: "a2",
        documentId: "doc-a",
        content: "short a2",
        fusedRank: 2,
        fusedScore: 0.4,
      }),
      candidate({
        chunkId: "b1",
        documentId: "doc-b",
        content: "short b1",
        fusedRank: 3,
        fusedScore: 0.3,
      }),
      candidate({
        chunkId: "style",
        documentId: "doc-style",
        content: "style only",
        automaticRole: "STYLE_POLICY",
        fusedRank: 4,
        fusedScore: 0.2,
      }),
    ],
    reranker: {
      version: "recorded-reranker-v1",
      scoreBatch: async (entries) =>
        Object.fromEntries(
          entries.map((entry) => [entry.chunkId, entry.chunkId === "b1" ? 1 : 0.1]),
        ),
      getUsage: () => null,
    },
    packing: { maxSelected: 2, tokenBudget: 8, maxPerDocument: 1 },
  });

  assert.deepEqual(result.selected.map((entry) => entry.chunkId), ["b1", "a2"]);
  assert.equal(
    result.candidates.find((entry) => entry.chunkId === "style")?.exclusionReason,
    "ROLE_NOT_ALLOWED",
  );
  assert.equal(
    result.candidates.find((entry) => entry.chunkId === "a1")?.exclusionReason,
    "TOKEN_BUDGET_EXCEEDED",
  );
  assert.equal(result.identity.reranker, "recorded-reranker-v1");
  assert.ok(result.candidates.every((entry) => entry.teamId === "team-a"));
  assert.ok(result.stageMetrics.dedupeMs >= 0);
  assert.ok(result.stageMetrics.rerankingMs >= 0);
  assert.ok(result.stageMetrics.contextPackingMs >= 0);
});

test("cross-tenant candidates fail closed before context packing", async () => {
  await assert.rejects(
    () =>
      finalizeKnowledgeRetrieval({
        activeTeamId: "team-a",
        requestedRoles: ["FACT"],
        candidates: [
          candidate({
            teamId: "team-b",
            chunkId: "leak",
            documentId: "doc-leak",
            content: "secret",
          }),
        ],
        reranker: { version: "NONE" },
        packing: { maxSelected: 1, tokenBudget: 10, maxPerDocument: 1 },
      }),
    /KNOWLEDGE_TEAM_SCOPE_VIOLATION/,
  );
});
