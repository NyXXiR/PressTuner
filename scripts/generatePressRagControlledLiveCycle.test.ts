import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { approveControlledLiveDataset } from "./approveControlledLiveDataset";
import { buildPressRagControlledLiveCycle } from "./generatePressRagControlledLiveCycle";

const draft = JSON.parse(readFileSync("evals/press-rag/controlled-live/dataset-v4.draft.json", "utf8"));
const reviewedAt = "2026-08-04T01:00:00.000Z";
const review = {
  version: "controlled-live-dataset-review/v1", status: "COMPLETE", datasetContentHash: draft.contentHash,
  reviewer: { type: "HUMAN", id: "reviewer" }, approvedAt: "2026-08-04T02:00:00.000Z", holdoutUntouched: true,
  decisions: draft.cases.map(({ id }: { id: string }) => ({ caseId: id, decision: "APPROVE", reviewedAt })),
  documents: draft.corpora.flatMap(({ documents }: { documents: any[] }) => documents.map((document) => ({ documentId: document.id, fileSha256: document.fileSha256, decision: "APPROVE" }))),
};
const dataset = approveControlledLiveDataset({ dataset: draft, review });
const execution = (id: string, configurationHash: string) => ({
  executionId: id, configurationHash,
  stageLatency: { endToEndMs: { sampleCount: 1, p50Ms: 1, p95Ms: 2 } }, totalCostMicros: 1,
  componentCostMicros: { queryEmbedding: 1, queryRewrite: 0, reranking: 0, agent: 1 },
});

const provenance = (id: string, configurationHash: string) => ({
  executionId: id,
  datasetHash: dataset.contentHash,
  configurationHash,
  caseRunIds: [`${id}-run`],
  startedAt: "2026-08-04T01:00:00.000Z",
  completedAt: "2026-08-04T01:01:00.000Z",
});

test("cycle preserves independent hashes, measured evidence, case narrative, and false deployment authorization", () => {
  const cycle = buildPressRagControlledLiveCycle({
    dataset,
    comparison: {
      version: "press-rag-controlled-live-comparison/v1",
      datasetHash: dataset.contentHash,
      provenance: {
        executorId: "press-agent-controlled-live/v1",
        baseline: provenance("b", "a".repeat(64)),
        candidate: provenance("c", "b".repeat(64)),
      },
      baseline: execution("b", "a".repeat(64)),
      candidate: execution("c", "b".repeat(64)),
    },
    calibration: { status: "PASS", totalCostMicros: 1 },
    regressionGate: { disposition: "PROMOTE", checks: [] },
    caseStudy: { failure: "f", hypothesis: "h", change: "c", independentComparison: "i", tradeoffs: "t", gateResult: "p" },
  });
  assert.equal(cycle.caseStudy.valid, true);
  assert.equal(cycle.deploymentAuthorized, false);
  assert.match(cycle.inputHashes.comparison, /^[a-f0-9]{64}$/);
  assert.equal(cycle.createdAt, "2026-08-04T01:01:00.000Z");
});

test("cycle rejects a comparison without raw independent-run provenance", () => {
  assert.throws(() => buildPressRagControlledLiveCycle({
    dataset,
    comparison: {
      datasetHash: dataset.contentHash,
      baseline: execution("b", "a".repeat(64)),
      candidate: execution("c", "b".repeat(64)),
    },
    calibration: { status: "PASS", totalCostMicros: 1 },
    regressionGate: { disposition: "PROMOTE", checks: [] },
    caseStudy: { failure: "f", hypothesis: "h", change: "c", independentComparison: "i", tradeoffs: "t", gateResult: "p" },
  }), /PRESS_RAG_CYCLE_EXECUTION_PROVENANCE_REQUIRED/);
});
