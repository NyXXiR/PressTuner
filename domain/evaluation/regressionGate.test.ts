import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRegressionGate } from "./regressionGate";

const descriptors = [
  { id: "quality", mandatory: true, direction: "higher" as const, threshold: 0.9 },
  {
    id: "retention",
    mandatory: true,
    direction: "higher" as const,
    threshold: 0.8,
  },
  {
    id: "cost",
    mandatory: true,
    direction: "lower" as const,
    requireNonRegression: true,
    allowedEvidenceClasses: ["measured" as const, "synthetic" as const],
  },
];
const measured = (value: number) => ({ evidenceClass: "measured" as const, value });

test("output deletion is rejected despite improved quality ratios", () => {
  const result = evaluateRegressionGate({
    descriptors,
    humanReview: "APPROVED",
    metrics: {
      quality: { baseline: measured(0.7), candidate: measured(1) },
      retention: { baseline: measured(1), candidate: measured(0) },
      cost: { baseline: measured(10), candidate: measured(9) },
    },
  });
  assert.equal(result.disposition, "REJECT");
  assert.equal(result.checks.find(({ metricId }) => metricId === "retention")?.status, "FAIL");
  assert.equal(result.deploymentAuthorized, false);
});

test("reused cost and missing task evidence stay non-evaluable", () => {
  const result = evaluateRegressionGate({
    descriptors,
    humanReview: "APPROVED",
    metrics: {
      quality: { baseline: measured(1), candidate: measured(1) },
      retention: { baseline: measured(1), candidate: measured(1) },
      cost: {
        baseline: { evidenceClass: "replay_derived", value: 10 },
        candidate: { evidenceClass: "replay_derived", value: 10 },
      },
    },
  });
  assert.equal(result.disposition, "NOT_EVALUABLE");
  assert.equal(result.checks[2].status, "NOT_EVALUABLE");
});

test("passing mandatory gates still require explicit human approval", () => {
  const metrics = {
    quality: { baseline: measured(0.9), candidate: measured(1) },
    retention: { baseline: measured(1), candidate: measured(1) },
    cost: { baseline: measured(10), candidate: measured(9) },
  };
  assert.equal(
    evaluateRegressionGate({ descriptors, metrics, humanReview: "PENDING" }).disposition,
    "NOT_EVALUABLE",
  );
  assert.equal(
    evaluateRegressionGate({ descriptors, metrics, humanReview: "APPROVED" }).disposition,
    "PROMOTE",
  );
});
