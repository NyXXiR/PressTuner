import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateRagMetrics, percentile } from "./ragMetrics";

test("RAG metrics separate retrieval, citation, grounding, and abstention quality", () => {
  const metrics = calculateRagMetrics([
    {
      caseId: "answerable",
      expectedDocumentIds: ["a", "b"],
      retrievedDocumentIds: ["a", "x"],
      citations: [{ documentId: "a", supported: true }],
      claims: [{ grounded: true }, { grounded: false }],
      expectedUnanswerable: false,
      predictedUnanswerable: false,
      expectedConflict: true,
      detectedConflict: true,
      latencyMs: 100,
      costMicros: 500,
    },
    {
      caseId: "unanswerable",
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
      citations: [{ documentId: "x", supported: false }],
      claims: [],
      expectedUnanswerable: true,
      predictedUnanswerable: true,
      expectedConflict: false,
      detectedConflict: false,
      latencyMs: 300,
      costMicros: 1_500,
    },
  ]);

  assert.equal(metrics.retrievalRecallAt5, 0.5);
  assert.equal(metrics.citationPrecision, 0.5);
  assert.equal(metrics.supportedCitationCount, 1);
  assert.equal(metrics.citationCount, 2);
  assert.equal(metrics.groundedClaimRate, 0.5);
  assert.equal(metrics.groundedClaimCount, 1);
  assert.equal(metrics.claimCount, 2);
  assert.equal(metrics.unanswerableAccuracy, 1);
  assert.equal(metrics.conflictDetectionAccuracy, 1);
  assert.equal(metrics.p50LatencyMs, 200);
  assert.equal(metrics.p95LatencyMs, 290);
  assert.equal(metrics.totalCostMicros, 2_000);
});

test("citation and claim rates are null when no observations exist", () => {
  const metrics = calculateRagMetrics([]);

  assert.equal(metrics.citationPrecision, null);
  assert.equal(metrics.supportedCitationCount, 0);
  assert.equal(metrics.citationCount, 0);
  assert.equal(metrics.groundedClaimRate, null);
  assert.equal(metrics.groundedClaimCount, 0);
  assert.equal(metrics.claimCount, 0);
});

test("the retained v1 artifact reproduces every historical metric", () => {
  const dataset = JSON.parse(
    readFileSync("evals/press-rag/v1/cases.json", "utf8"),
  ) as { cases: Array<Record<string, unknown>> };
  const artifact = JSON.parse(
    readFileSync("evals/press-rag/v1/results-2026-07-23.json", "utf8"),
  ) as { results: Array<Record<string, unknown>> };
  const baseline = JSON.parse(
    readFileSync("evals/press-rag/v1/baseline-2026-07-23.json", "utf8"),
  ) as { metrics: Record<string, number> };
  const expectations = new Map(
    dataset.cases.map((entry) => [entry.id, entry]),
  );
  const results = artifact.results.map((result) => ({
    ...result,
    expectedDocumentIds: expectations.get(result.caseId)?.expectedDocumentIds,
    expectedUnanswerable: expectations.get(result.caseId)?.expectedUnanswerable,
    expectedConflict: expectations.get(result.caseId)?.expectedConflict,
  }));
  const metrics = calculateRagMetrics(
    results as Parameters<typeof calculateRagMetrics>[0],
  );

  for (const [key, value] of Object.entries(baseline.metrics)) {
    assert.equal(metrics[key as keyof typeof metrics], value, key);
  }
});

test("percentile interpolates sorted observations and handles empty input", () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([300, 100], 0.5), 200);
});
