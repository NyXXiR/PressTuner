import assert from "node:assert/strict";
import test from "node:test";
import { mapTransitionEvaluation } from "./pressMapper";
import { projectCanonicalEventToOpsConsole } from "./opsConsoleProjection";

test("ops projection strips raw tenant and content evidence", () => {
  const event = mapTransitionEvaluation({ teamId: "team-private", runId: "run", attemptId: "attempt", registryHash: "fnv1a32:12345678" }, { transitionId: "t", edgeId: "brief-draft", sourceNodeId: "brief-normalization", evaluator: { id: "grounding", version: "1" }, verdict: "WARN", expected: "private memo", observed: "private output" });
  const value = JSON.stringify(projectCanonicalEventToOpsConsole(event)); assert.doesNotMatch(value, /team-private|private memo|private output/);
});
