import assert from "node:assert/strict";
import test from "node:test";
import { mapTransitionEvaluation } from "./pressMapper";
import { projectCanonicalEventToOpenInference } from "./openInferenceProjection";

test("OpenInference projection exposes semantics without evidence values", () => {
  const event = mapTransitionEvaluation({ teamId: "team", runId: "run", attemptId: "attempt", registryHash: "fnv1a32:12345678" }, { transitionId: "t", edgeId: "brief-draft", sourceNodeId: "brief-normalization", evaluator: { id: "grounding", version: "1" }, verdict: "BLOCK", expected: "secret memo", observed: "secret prose" });
  const projected = projectCanonicalEventToOpenInference(event); assert.equal(projected.attributes["openinference.span.kind"], "EVALUATOR"); assert.doesNotMatch(JSON.stringify(projected), /secret memo|secret prose/);
});
