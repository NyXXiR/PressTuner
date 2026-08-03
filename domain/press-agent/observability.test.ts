import assert from "node:assert/strict";
import test from "node:test";

import { calculatePressAgentObservability } from "./observability";

const at = (ms: number) => new Date(ms);

test("calculates durable knowledge and agent operating metrics", () => {
  const report = calculatePressAgentObservability({
    documents: [
      {
        status: "READY",
        queuedAt: at(0),
        processingStartedAt: at(100),
        indexedAt: at(500),
      },
      {
        status: "READY",
        queuedAt: at(0),
        processingStartedAt: at(300),
        indexedAt: at(900),
      },
      {
        status: "FAILED",
        queuedAt: at(0),
        processingStartedAt: at(200),
        indexedAt: null,
      },
    ],
    runs: [
      {
        status: "COMPLETED",
        latencyMs: 1_000,
        retryCount: 0,
        inputTokens: 100,
        cachedInputTokens: 25,
        estimatedCostMicros: 200,
      },
      {
        status: "FAILED",
        latencyMs: 3_000,
        retryCount: 2,
        inputTokens: 300,
        cachedInputTokens: 75,
        estimatedCostMicros: 600,
      },
    ],
    steps: [
      { kind: "TOOL", latencyMs: 100 },
      { kind: "TOOL", latencyMs: 300 },
      { kind: "MODEL", latencyMs: 1_000 },
      { kind: "MODEL", latencyMs: 3_000 },
    ],
    approvals: [
      { requestedAt: at(1_000), decidedAt: at(1_500) },
      { requestedAt: at(2_000), decidedAt: at(3_500) },
    ],
  });

  assert.equal(report.knowledge.indexSuccessRate, 2 / 3);
  assert.equal(report.knowledge.queueLatencyMs.p50, 200);
  assert.equal(report.knowledge.indexingLatencyMs.p95, 590);
  assert.equal(report.agent.failureRate, 0.5);
  assert.equal(report.agent.avgRetryCount, 1);
  assert.equal(report.agent.cachedInputRatio, 0.25);
  assert.equal(report.agent.avgCostMicrosPerRun, 400);
  assert.equal(report.agent.runLatencyMs.p50, 2_000);
  assert.equal(report.agent.modelLatencyMs.p95, 2_900);
  assert.equal(report.agent.toolLatencyMs.p95, 290);
  assert.equal(report.agent.approvalWaitMs.p50, 1_000);
});
