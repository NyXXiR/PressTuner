import assert from "node:assert/strict";
import test from "node:test";

import { evaluateControlledLiveRagRegressionGate } from "./controlledLiveRegressionGate";

const observable = (overrides: Record<string, unknown> = {}) => ({
  retrievalRecallAt5: 0.9, citationDocumentPrecision: 0.95, answerabilityAccuracy: 0.95,
  agentCompletionRate: 0.9, claimGroundedness: { status: "EVALUABLE", value: 0.95 },
  conflictDetection: { status: "EVALUABLE", value: 0.95 }, p95LatencyMs: 10_000,
  totalCostMicros: 100_000, ...overrides,
});

test("promotes only measured, calibrated, reviewed candidates passing every RAG gate", () => {
  const result = evaluateControlledLiveRagRegressionGate({
    comparison: { baseline: observable(), candidate: observable({ retrievalRecallAt5: 1, p95LatencyMs: 9_000 }) },
    calibration: { status: "PASS" }, humanReview: "APPROVED",
  });
  assert.equal(result.disposition, "PROMOTE");
  assert.equal(result.deploymentAuthorized, false);
});

test("rejects a quality gain that breaches latency and completion gates", () => {
  const result = evaluateControlledLiveRagRegressionGate({
    comparison: { baseline: observable(), candidate: observable({ retrievalRecallAt5: 1, p95LatencyMs: 21_000, agentCompletionRate: 0.5 }) },
    calibration: { status: "PASS" }, humanReview: "APPROVED",
  });
  assert.equal(result.disposition, "REJECT");
  assert.deepEqual(result.checks.filter(({ status }) => status === "FAIL").map(({ metricId }) => metricId), ["agentCompletionRate", "p95LatencyMs"]);
});

test("keeps an otherwise passing experiment not evaluable before review or calibration", () => {
  const result = evaluateControlledLiveRagRegressionGate({
    comparison: { baseline: observable(), candidate: observable({ claimGroundedness: { status: "NOT_EVALUABLE" } }) },
    calibration: { status: "FAIL" }, humanReview: "PENDING",
  });
  assert.equal(result.disposition, "NOT_EVALUABLE");
});

test("allows a small p95 variance while keeping the absolute latency ceiling", () => {
  const result = evaluateControlledLiveRagRegressionGate({
    comparison: {
      baseline: observable({ p95LatencyMs: 18_500 }),
      candidate: observable({ retrievalRecallAt5: 1, p95LatencyMs: 19_000 }),
    },
    calibration: { status: "PASS" },
    humanReview: "APPROVED",
  });
  assert.equal(
    result.checks.find(({ metricId }) => metricId === "p95LatencyMs")?.status,
    "PASS",
  );
});
