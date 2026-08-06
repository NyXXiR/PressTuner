import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluatePressTransitionDataset } from "./pressTransitionEvaluator";

test("deterministic evaluator covers topology, metadata privacy and regression gates", () => {
  const dataset = JSON.parse(readFileSync("evals/press-ai-debugger/v1/dataset.json", "utf8")); const baseline = JSON.parse(readFileSync("evals/press-ai-debugger/v1/baseline.json", "utf8"));
  const artifact = evaluatePressTransitionDataset(dataset, baseline); assert.equal(artifact.releaseBlockingPassed, true); assert.deepEqual(artifact.metrics, { expectedVerdictAccuracy: 1, metadataExclusionRate: 1, evidenceBoundCompliance: 1, requiredEdgeCoverage: 1 }); assert.ok(artifact.events.every((event, index) => event.sequence === index + 1));
});
