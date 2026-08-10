import assert from "node:assert/strict";
import test from "node:test";
import { buildOpsConsoleWorkflowManifest } from "@/domain/press-ai-debugger/opsConsoleWorkflowManifest";
import { mapEdgeTraversed, mapHumanApproval, mapNodeLifecycle, mapTransitionEvaluation, withCanonicalSequence } from "./pressMapper";
import { batchOpsConsoleExecutionFacts, projectOpsConsoleExecutionFacts } from "./opsConsoleExecutionFactProjection";

const operationId = "10000000-0000-4000-8000-000000000001";
const context = { teamId: "raw-team-secret", runId: "run", attemptId: "attempt", processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", occurredAt: "2026-08-10T00:00:00.000Z" };

test("canonical telemetry projects deterministically without private canonical fields", () => {
  const events = [
    withCanonicalSequence(mapNodeLifecycle(context, { nodeId: "brief-normalization", commandId: "start", phase: "STARTED" }), 1),
    withCanonicalSequence(mapTransitionEvaluation(context, { transitionId: "evaluation", edgeId: "brief-draft", sourceNodeId: "brief-normalization", evaluator: { id: "memo-brief-grounding", version: "1" }, verdict: "BLOCK", expected: "private prompt", observed: "generated article", reasonCode: "grounding-failed" }), 2),
    withCanonicalSequence(mapEdgeTraversed(context, { transitionId: "blocked", edgeId: "brief-draft", sourceNodeId: "brief-normalization", targetNodeId: "draft-generation", verdict: "PASS", acknowledged: false, traversalState: "NOT_TAKEN", reasonCode: "grounding-failed" }), 3),
    withCanonicalSequence(mapHumanApproval(context, { sourceId: "review", gateId: "confirm-normalized-brief", phase: "RECORDED", decision: "APPROVED", actorId: "raw-user-secret" }), 4),
  ];
  const args = { operationId, manifest: buildOpsConsoleWorkflowManifest("press-creation"), events };
  const first = projectOpsConsoleExecutionFacts(args);
  assert.deepEqual(first, projectOpsConsoleExecutionFacts(args));
  assert.deepEqual(first.map((item) => item.kind), ["node.lifecycle", "transition.evaluation", "edge.traversal", "human.review"]);
  assert.equal(first[2]?.kind === "edge.traversal" && first[2].state, "NOT_TAKEN");
  assert.doesNotMatch(JSON.stringify(first), /raw-team-secret|raw-user-secret|private prompt|generated article|actorRef|attributes|factValue|sourceField/i);
});

test("projection rejects registry mismatches and batches at 100 facts", () => {
  const manifest = buildOpsConsoleWorkflowManifest("press-creation");
  const source = mapNodeLifecycle(context, { nodeId: "brief-normalization", commandId: "start", phase: "STARTED" });
  const events = Array.from({ length: 101 }, (_, index) => withCanonicalSequence({ ...source, eventId: `aevt_${String(index).padStart(48, "0")}` }, index + 1));
  const batches = batchOpsConsoleExecutionFacts(projectOpsConsoleExecutionFacts({ operationId, manifest, events }));
  assert.deepEqual(batches.map((item) => item.facts.length), [100, 1]);
  assert.throws(() => projectOpsConsoleExecutionFacts({ operationId, manifest, events: [mapNodeLifecycle(context, { nodeId: "not-in-manifest", commandId: "bad", phase: "STARTED" })] }), /STAGE_REFERENCE_INVALID/);
});
