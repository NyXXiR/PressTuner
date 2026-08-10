import assert from "node:assert/strict";
import test from "node:test";
import { mapEdgeTraversed, mapHumanApproval, mapNodeLifecycle, mapPressProcessEvent, mapReplayStarted, mapTransitionEvaluation } from "./pressMapper";

const context = { teamId: "team", runId: "run", attemptId: "attempt", processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678" };
test("press mapper preserves node, edge, approval and replay topology", () => {
  const node = mapNodeLifecycle(context, { nodeId: "draft-generation", commandId: "command-1", phase: "STARTED" }); assert.equal(node.attributes["domain.node.id"], "draft-generation");
  const edge = mapEdgeTraversed(context, { transitionId: "transition", edgeId: "brief-draft", sourceNodeId: "brief-normalization", targetNodeId: "draft-generation", verdict: "PASS", acknowledged: true }); assert.equal(edge.eventKind, "edge.traversed"); assert.equal(edge.payload.targetNodeId, "draft-generation");
  const approval = mapHumanApproval(context, { sourceId: "t", gateId: "confirm", phase: "RECORDED", decision: "APPROVED", actorId: "user-secret" }); assert.equal(approval.eventKind, "human.approval"); assert.equal(approval.payload.actorRef?.startsWith("actor_"), true);
  assert.equal(mapHumanApproval(context, { sourceId: "waiting", gateId: "confirm", phase: "REQUESTED", decision: "PENDING" }).status, "WAITING");
  assert.equal(mapReplayStarted({ ...context, parentAttemptId: "parent" }, { sourceAttemptId: "parent" }).executionMode, "REPLAY");
  const evaluation = mapTransitionEvaluation(context, { transitionId: "t", edgeId: "brief-draft", sourceNodeId: "brief-normalization", evaluator: { id: "grounding", version: "1" }, verdict: "WARN", expected: "raw memo", observed: "generated prose" }); assert.equal(evaluation.eventKind, "transition.evaluation"); assert.equal(evaluation.payload.verdict, "WARN");
});

test("process edges preserve taken and explicit not-taken traversal state", () => {
  const common = { schemaVersion: "press-ai-process-event/v1" as const, processId: "press-creation" as const, processVersion: "2.0.0", eventId: "event", dedupeKey: "dedupe", runId: "run", sequence: 1, occurredAt: "2026-08-06T00:00:00.000Z", type: "edge.state" as const };
  const edge = { id: "brief-draft", source: "brief-normalization", target: "draft-generation", findingCode: null };
  const blocked = mapPressProcessEvent(context, { ...common, edge: { ...edge, state: "blocked" } });
  assert.equal(blocked?.eventKind === "edge.traversed" && blocked.payload.traversalState, "NOT_TAKEN");
  const taken = mapPressProcessEvent(context, { ...common, edge: { ...edge, state: "taken" } });
  assert.equal(taken?.eventKind === "edge.traversed" && taken.payload.traversalState, "TAKEN");
  assert.equal(mapPressProcessEvent(context, { ...common, edge: { ...edge, state: "moving" } }), null);
});
