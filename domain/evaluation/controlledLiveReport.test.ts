import assert from "node:assert/strict";
import test from "node:test";

import type {
  ControlledLiveDataset,
  ControlledLiveExecutionArtifact,
} from "./controlledLiveEvaluation";
import { buildControlledLiveComparisonReport } from "./controlledLiveReport";

function dataset(): ControlledLiveDataset {
  const raw = {
    version: "press-rag-controlled-live/v1",
    status: "APPROVED",
    createdAt: "2026-08-03T00:00:00.000Z",
    author: "test",
    approval: {
      reviewer: "human",
      reviewedAt: "2026-08-03T00:01:00.000Z",
      note: "approved fixture",
    },
    corpora: [
      {
        id: "corpus",
        authorizationTags: ["CONTROLLED_LIVE"],
        documents: [
          {
            id: "doc",
            filePath: "evals/doc.pdf",
            fileSha256: "a".repeat(64),
            source: { title: "doc", publisher: "test", publishedAt: null, sourceUrl: null },
            role: "FACT",
          },
        ],
      },
    ],
    cases: Array.from({ length: 40 }, (_, index) => ({
      id: `case-${index + 1}`,
      kind: "RETRIEVAL_ONLY",
      prompt: "fact?",
      corpusId: "corpus",
      expectedDocumentIds: ["doc"],
      expectedSpanIds: [],
      requiredFacts: [],
      forbiddenFacts: [],
      forbiddenSourceIds: [],
      expectedAnswerability: "ANSWER",
      expectedAbstentionReason: null,
      expectedConflict: false,
      expectedTools: [],
      annotation: {
        rationale: "fixture",
        reviewer: "human",
        reviewedAt: "2026-08-03T00:01:00.000Z",
      },
    })),
    partitions: {
      development: Array.from({ length: 10 }, (_, index) => `case-${index + 1}`),
      regression: Array.from({ length: 10 }, (_, index) => `case-${index + 11}`),
      adversarial: Array.from({ length: 10 }, (_, index) => `case-${index + 21}`),
      holdout: Array.from({ length: 10 }, (_, index) => `case-${index + 31}`),
    },
  };
  return raw as unknown as ControlledLiveDataset;
}

function artifact(args: {
  executionId: string;
  configurationHash: string;
  correctCount: number;
}): ControlledLiveExecutionArtifact {
  return {
    executionId: args.executionId,
    datasetHash: "d".repeat(64),
    configurationHash: args.configurationHash,
    agentRunCount: 3,
    startedAt: "2026-08-03T00:00:00.000Z",
    completedAt: "2026-08-03T00:01:00.000Z",
    totalCostMicros: 40,
    results: Array.from({ length: 40 }, (_, index) => ({
      caseRunId: `${args.executionId}-${index}`,
      caseId: `case-${index + 1}`,
      kind: "RETRIEVAL_ONLY",
      runIndex: 1,
      latencyMs: index + 1,
      costMicros: 1,
      result: {
        productResult: {
          hits: index < args.correctCount ? [{ documentId: "actual-doc" }] : [],
          stageMetrics: {
            queryEmbeddingMs: index + 0.25,
            combinedHybridSqlRetrievalMs: index + 0.5,
          },
          componentCostMicros: { queryEmbedding: 1, queryRewrite: 0, reranking: 0 },
        },
        documentIdMap: { "actual-doc": "doc" },
      },
    })),
  };
}

test("comparison scores only observable evidence and reports unsupported metrics as not evaluable", () => {
  const report = buildControlledLiveComparisonReport({
    dataset: dataset(),
    baseline: artifact({
      executionId: "baseline",
      configurationHash: "a".repeat(64),
      correctCount: 20,
    }),
    candidate: artifact({
      executionId: "candidate",
      configurationHash: "b".repeat(64),
      correctCount: 40,
    }),
  });
  assert.equal(report.baseline.retrievalRecallAt5, 0.5);
  assert.equal(report.candidate.retrievalRecallAt5, 1);
  assert.equal(report.delta.retrievalRecallAt5, 0.5);
  assert.equal(report.candidate.agentCompletionRate, null);
  assert.equal(report.provenance.baseline.executionId, "baseline");
  assert.equal(report.provenance.candidate.executionId, "candidate");
  assert.equal(report.provenance.baseline.caseRunIds.length, 40);
  assert.equal(
    report.provenance.baseline.caseRunIds.some((caseRunId) =>
      report.provenance.candidate.caseRunIds.includes(caseRunId),
    ),
    false,
  );
  assert.deepEqual(report.candidate.claimGroundedness, {
    status: "NOT_EVALUABLE",
    reason: "CLAIM_EVIDENCE_NOT_EMITTED",
  });
  assert.equal(report.candidate.p95LatencyMs, 38.05);
  assert.equal(report.candidate.stageBoundary, "combined-hybrid-sql-retrieval-v1");
  assert.equal(report.candidate.stageLatency.combinedHybridSqlRetrievalMs?.sampleCount, 40);
  assert.deepEqual(report.candidate.componentCostMicros, {
    queryEmbedding: 40,
    queryRewrite: 0,
    reranking: 0,
  });
});

test("comparison rejects non-independent executions", () => {
  const baseline = artifact({
    executionId: "same",
    configurationHash: "a".repeat(64),
    correctCount: 20,
  });
  assert.throws(
    () => buildControlledLiveComparisonReport({ dataset: dataset(), baseline, candidate: baseline }),
    /CONTROLLED_LIVE_EXECUTION_ID_MUST_DIFFER/,
  );
});

test("reports verified Agent completion independently from retrieval success", () => {
  const controlledDataset = dataset();
  (controlledDataset.cases[0] as { kind: string }).kind = "AGENT";
  const baseline = artifact({ executionId: "baseline-agent", configurationHash: "a".repeat(64), correctCount: 20 });
  const candidate = artifact({ executionId: "candidate-agent", configurationHash: "b".repeat(64), correctCount: 40 });
  (baseline.results[0] as any).kind = "AGENT";
  (baseline.results[0] as any).result.productResult = { status: "FAILED", output: null, steps: [] };
  (candidate.results[0] as any).kind = "AGENT";
  (candidate.results[0] as any).result.productResult = {
    status: "COMPLETED",
    output: { cannotAnswer: true, claimVerification: { claims: [] } },
    steps: [], citations: [],
  };
  const report = buildControlledLiveComparisonReport({ dataset: controlledDataset, baseline, candidate });
  assert.equal(report.baseline.agentCompletionRate, 0);
  assert.equal(report.candidate.agentCompletionRate, 1);
  assert.equal(report.delta.agentCompletionRate, 1);
});
