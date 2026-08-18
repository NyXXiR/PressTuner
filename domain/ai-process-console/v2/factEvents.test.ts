import assert from "node:assert/strict";
import test from "node:test";
import { createV2FactFactory } from "./factEvents";
import { componentRevisionForNode, componentRevisionForRequirement } from "./publication";

test("v2 facts inherit complete attempt metadata without optional caller assembly", () => {
  const factory = createV2FactFactory({ identity: { caseId: "case-1", objectType: "synthetic-press-fixture", operationId: "operation-1", attemptId: "attempt-1", testRunId: "run-1" }, clock: () => new Date("2030-01-01T00:00:00.000Z") });
  const started = factory.create({ type: "dev.aiprocess.event.attempt.started.v2", logicalKey: "attempt:started", sequence: 1, data: {} });
  assert.deepEqual(started.metadata, factory.metadata);
  assert.equal(started.metadata.scope, "ATTEMPT");
  assert.equal(started.metadata.processVersion, "3.0.0");
  assert.equal(started.correlationId, "case-1");
  assert.equal(factory.create({ type: started.type, logicalKey: "attempt:started", sequence: 1, data: {} }).id, started.id);
});

test("v2 quality observations point to one exact node occurrence", () => {
  const factory = createV2FactFactory({ identity: { caseId: "case-2", objectType: "synthetic-press-fixture", operationId: "operation-2", attemptId: "attempt-2", testRunId: "run-2" } });
  const nodeStarted = factory.create({ type: "dev.aiprocess.event.node.execution.started.v2", logicalKey: "node:selected-rewrite:started", sequence: 1, data: { nodeExecutionId: "execution-1", nodeId: "selected-rewrite", handler: componentRevisionForNode("selected-rewrite"), enteredBy: { kind: "ENTRY" } } });
  const nodeCompleted = factory.create({ type: "dev.aiprocess.event.node.execution.completed.v2", logicalKey: "node:selected-rewrite:completed", sequence: 2, causationId: nodeStarted.id, data: { nodeExecutionId: "execution-1", nodeId: "selected-rewrite", startedEventId: nodeStarted.id, handler: componentRevisionForNode("selected-rewrite") } });
  const observed = factory.create({ type: "dev.aiprocess.event.requirement.observed.v2", logicalKey: "requirement:final-output-quality:execution-1", sequence: 3, causationId: nodeCompleted.id, data: { requirementId: "final-output-quality", requirementVersion: "1.0.0", evaluator: componentRevisionForRequirement("final-output-quality"), location: { kind: "NODE", nodeId: "selected-rewrite" }, occurrence: { kind: "NODE", nodeId: "selected-rewrite", nodeExecutionId: "execution-1" }, observedForEventId: nodeCompleted.id, outcome: { state: "EVALUATED", verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] } } });
  assert.equal(observed.causationId, nodeCompleted.id);
  assert.equal(observed.type, "dev.aiprocess.event.requirement.observed.v2");
  if (observed.type !== "dev.aiprocess.event.requirement.observed.v2") throw new Error("unexpected event type");
  assert.deepEqual(observed.data.occurrence, { kind: "NODE", nodeId: "selected-rewrite", nodeExecutionId: "execution-1" });
});
