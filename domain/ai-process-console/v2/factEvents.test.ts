import assert from "node:assert/strict";
import test from "node:test";
import { createV2FactFactory, createV2RunFactFactory } from "./factEvents";
import { buildProcessDefinitionV2, componentRevisionForNode, componentRevisionForRequirement } from "./publication";
import { processDefinitionReference } from "../v1/publication";

test("v2 facts inherit complete attempt metadata without optional caller assembly", () => {
  const factory = createV2FactFactory({ identity: { caseId: "case-1", objectType: "synthetic-press-fixture", operationId: "operation-1", attemptId: "attempt-1", testRunId: "run-1" }, clock: () => new Date("2030-01-01T00:00:00.000Z") });
  const started = factory.create({ type: "dev.aiprocess.event.attempt.started.v2", logicalKey: "attempt:started", sequence: 1, data: {} });
  assert.deepEqual(started.metadata, factory.metadata);
  assert.equal(started.metadata.scope, "ATTEMPT");
  assert.equal(started.metadata.processVersion, "3.0.0");
  assert.equal(started.correlationId, "case-1");
  assert.equal(factory.create({ type: started.type, logicalKey: "attempt:started", sequence: 1, data: {} }).id, started.id);
});

test("v2 run facts use a deterministic isolated run stream without attempt identity", () => {
  const factory = createV2RunFactFactory({ testRunId: "run-1", clock: () => new Date("2030-01-01T00:00:00.000Z") });
  const accepted = factory.create({ type: "dev.aiprocess.event.test-run.accepted.v2", logicalKey: "test-run:accepted", sequence: 1, data: { processDefinition: processDefinitionReference(buildProcessDefinitionV2()) } });
  const completed = factory.create({ type: "dev.aiprocess.event.test-run.completed.v2", logicalKey: "test-run:completed", sequence: 2, causationId: "attempt-terminal", data: { runnerOutcome: "COMPLETED" } });
  const rejected = factory.create({ type: "dev.aiprocess.event.test-run.rejected.v2", logicalKey: "test-run:rejected", sequence: 1, data: { reasonCode: "ISOLATION_UNAVAILABLE" } });
  assert.equal(accepted.correlationId, "run-1");
  assert.equal(completed.correlationId, "run-1");
  assert.equal(rejected.correlationId, "run-1");
  assert.deepEqual([accepted.sequence, completed.sequence, rejected.sequence], [1, 2, 1]);
  assert.deepEqual(factory.metadata, {
    projectId: "presstuner", environment: "conformance", serviceName: "presstuner",
    processId: "press-creation", processVersion: "3.0.0", processDefinitionHash: buildProcessDefinitionV2().canonicalSha256,
    scope: "RUN", executionMode: "TEST", testRunId: "run-1",
  });
  assert.equal("operationId" in factory.metadata, false);
  assert.equal("attemptId" in factory.metadata, false);
  assert.equal(factory.create({ type: "dev.aiprocess.event.test-run.accepted.v2", logicalKey: "test-run:accepted", sequence: 1, data: accepted.data }).id, accepted.id);
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

test("v2 attempt failure requires exact causation when it identifies a failed event", () => {
  const factory = createV2FactFactory({ identity: { caseId: "case-3", objectType: "synthetic-press-fixture", operationId: "operation-3", attemptId: "attempt-3", testRunId: "run-3" } });
  const event = factory.create({ type: "dev.aiprocess.event.attempt.failed.v2", logicalKey: "attempt:failed", sequence: 1, causationId: "transition-evaluated", data: { failureCode: "TRANSITION_GUARDRAIL_BLOCK", failedEventId: "transition-evaluated" } });
  assert.equal(event.type, "dev.aiprocess.event.attempt.failed.v2");
  if (event.type !== "dev.aiprocess.event.attempt.failed.v2") throw new Error("unexpected event type");
  assert.equal(event.causationId, event.data.failedEventId);
  assert.throws(() => factory.create({ type: "dev.aiprocess.event.attempt.failed.v2", logicalKey: "attempt:failed-mismatch", sequence: 1, causationId: "other", data: { failureCode: "TRANSITION_GUARDRAIL_BLOCK", failedEventId: "transition-evaluated" } }));
});
