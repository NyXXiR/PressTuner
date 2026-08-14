import assert from "node:assert/strict";
import test from "node:test";

import type { PressAgentWorkflowEventV1 } from "@/domain/evaluation/pressAgentWorkflowEvents";
import { createResolvedFactFactory } from "./factEvents";
import { projectPressAgentWorkflowFact } from "./pressAgentFactProjection";
import { buildRagQueryProcessDefinition } from "./publication";

const runId = "run-live-123";
const operationId = "123e4567-e89b-42d3-a456-426614174000";

function workflowEvent(
  sequence: number,
  value:
    | { type: "run.started"; run: { status: "running" } }
    | { type: "stage.state"; stage: PressAgentWorkflowEventV1 & never }
    | { type: "edge.state"; edge: PressAgentWorkflowEventV1 & never }
    | { type: "run.finished"; run: { status: "succeeded" | "warning" | "failed" | "cancelled" | "blocked"; findingCode: "runtime-failed" | "user-cancelled" | "approval-required" | "guardrail-warning" | null } },
): PressAgentWorkflowEventV1 {
  return {
    schemaVersion: "press-agent-workflow-event/v1",
    eventId: `workflow-event-${sequence}`,
    dedupeKey: `workflow:${sequence}`,
    runId,
    sequence,
    occurredAt: new Date(Date.UTC(2030, 0, 1, 0, 0, sequence)).toISOString(),
    ...value,
  } as PressAgentWorkflowEventV1;
}

const started = workflowEvent(1, { type: "run.started", run: { status: "running" } });

function factory(includeOperationId = true) {
  return createResolvedFactFactory({
    definition: buildRagQueryProcessDefinition(),
    executionMode: "LIVE",
    identity: {
      caseId: runId,
      objectType: "press-agent-rag-query",
      ...(includeOperationId ? { operationId } : {}),
      attemptId: runId,
      correlationId: runId,
      trace: { provider: "LANGSMITH", traceId: "0123456789abcdef0123456789abcdef" },
    },
  });
}

function project(event: PressAgentWorkflowEventV1, priorEvents: readonly PressAgentWorkflowEventV1[] = [], sequence = 1) {
  return projectPressAgentWorkflowFact({ event, priorEvents, factory: factory(), sequence });
}

test("run start becomes a LIVE attempt fact with the trusted shared identity", () => {
  const fact = project(started);
  assert.ok(fact);
  assert.equal(fact.id, started.eventId);
  assert.equal(fact.type, "dev.aiprocess.event.attempt.started.v1");
  assert.deepEqual(fact.data, { attemptId: runId });
  assert.equal(fact.executionMode, "LIVE");
  assert.equal(fact.metadata?.caseId, runId);
  assert.equal(fact.metadata?.correlationId, runId);
  assert.equal(fact.metadata?.attemptId, runId);
  assert.equal(fact.metadata?.operationId, operationId);
  assert.equal(fact.metadata?.processId, "rag-query");
  assert.equal(fact.metadata?.processVersion, "1.0.0");
  assert.deepEqual(fact.trace, { provider: "LANGSMITH", traceId: "0123456789abcdef0123456789abcdef" });
});

test("missing operation identity stays absent and no provider trace is fabricated", () => {
  const noOperationFactory = createResolvedFactFactory({
    definition: buildRagQueryProcessDefinition(),
    executionMode: "LIVE",
    identity: { caseId: runId, objectType: "press-agent-rag-query", attemptId: runId, correlationId: runId },
  });
  const fact = projectPressAgentWorkflowFact({ event: started, priorEvents: [], factory: noOperationFactory, sequence: 1 });
  assert.ok(fact);
  assert.equal(fact.metadata?.operationId, undefined);
  assert.equal(fact.metadata?.traceId, undefined);
  assert.equal(fact.trace, undefined);
});

test("stage lifecycle maps to execution facts and derives duration only from a prior start", () => {
  const running = workflowEvent(2, { type: "stage.state", stage: { id: "retrieval-execution", state: "running", findingCode: null } } as never);
  const completed = workflowEvent(5, { type: "stage.state", stage: { id: "retrieval-execution", state: "warning", findingCode: "retrieval-empty" } } as never);
  const startFact = project(running, [started], 2);
  assert.ok(startFact);
  assert.equal(startFact.type, "dev.aiprocess.event.node.execution.started.v1");
  assert.equal(startFact.causationId, undefined);
  const completedFact = project(completed, [started, running], 3);
  assert.ok(completedFact);
  assert.equal(completedFact.type, "dev.aiprocess.event.node.execution.completed.v1");
  assert.equal(completedFact.causationId, running.eventId);
  assert.equal("durationMs" in completedFact.data && completedFact.data.durationMs, 3_000);

  const noStart = workflowEvent(6, { type: "stage.state", stage: { id: "request-intake", state: "succeeded", findingCode: null } } as never);
  const noDurationFact = project(noStart, [started], 2);
  assert.ok(noDurationFact);
  assert.equal(noDurationFact.type, "dev.aiprocess.event.node.execution.completed.v1");
  assert.equal("durationMs" in noDurationFact.data, false);
  assert.equal(noDurationFact.causationId, undefined);
});

test("failed and blocked stages fail while waiting and skipped stages emit nothing", () => {
  const running = workflowEvent(2, { type: "stage.state", stage: { id: "terminal-evaluation", state: "running", findingCode: null } } as never);
  const failed = workflowEvent(3, { type: "stage.state", stage: { id: "terminal-evaluation", state: "failed", findingCode: "runtime-failed" } } as never);
  const blocked = workflowEvent(4, { type: "stage.state", stage: { id: "terminal-evaluation", state: "blocked", findingCode: "approval-required" } } as never);
  const waiting = workflowEvent(5, { type: "stage.state", stage: { id: "fallback", state: "waiting", findingCode: null } } as never);
  const skipped = workflowEvent(6, { type: "stage.state", stage: { id: "fallback", state: "skipped", findingCode: "user-cancelled" } } as never);
  const failedFact = project(failed, [started, running], 3);
  const blockedFact = project(blocked, [started, running], 3);
  assert.ok(failedFact && blockedFact);
  assert.equal(failedFact.type, "dev.aiprocess.event.node.execution.failed.v1");
  assert.equal(blockedFact.type, "dev.aiprocess.event.node.execution.failed.v1");
  assert.equal("errorCode" in failedFact.data && failedFact.data.errorCode, "runtime-failed");
  assert.equal("errorCode" in blockedFact.data && blockedFact.data.errorCode, "approval-required");
  assert.equal(project(waiting, [started]), null);
  assert.equal(project(skipped, [started]), null);
});

test("selected edges preserve selection while only unambiguously not-taken edges are evaluated", () => {
  const sourceCompleted = workflowEvent(2, { type: "stage.state", stage: { id: "verification", state: "succeeded", findingCode: null } } as never);
  const taken = workflowEvent(3, { type: "edge.state", edge: { id: "verification-terminal", source: "verification", target: "terminal-evaluation", state: "taken", findingCode: null } } as never);
  const violation = workflowEvent(4, { type: "edge.state", edge: { id: "verification-fallback", source: "verification", target: "fallback", state: "taken-with-violation", findingCode: "claim-verification-failed" } } as never);
  const notTaken = workflowEvent(5, { type: "edge.state", edge: { id: "fallback-terminal", source: "fallback", target: "terminal-evaluation", state: "not-taken", findingCode: null } } as never);
  const moving = workflowEvent(6, { type: "edge.state", edge: { id: "retrieval-evidence", source: "retrieval-execution", target: "evidence-decision", state: "moving", findingCode: null } } as never);
  const blocked = workflowEvent(7, { type: "edge.state", edge: { id: "response-verification", source: "response-behavior", target: "verification", state: "blocked", findingCode: "user-cancelled" } } as never);
  for (const event of [taken, violation]) {
    const fact = project(event, [started, sourceCompleted], event.sequence);
    assert.ok(fact);
    assert.equal(fact.type, "dev.aiprocess.event.transition.selected.v1");
    assert.equal(fact.id, event.eventId);
  }
  const evaluated = project(notTaken, [started], 2);
  assert.ok(evaluated);
  assert.equal(evaluated.type, "dev.aiprocess.event.transition.evaluated.v1");
  assert.equal("matched" in evaluated.data && evaluated.data.matched, false);
  assert.equal(project(moving, [started]), null);
  assert.equal(project(blocked, [started]), null);
});

test("run terminal states map to attempt completion or failure with emitted terminal causation", () => {
  const terminal = workflowEvent(2, { type: "stage.state", stage: { id: "terminal-evaluation", state: "warning", findingCode: "guardrail-warning" } } as never);
  const succeeded = workflowEvent(3, { type: "run.finished", run: { status: "warning", findingCode: "guardrail-warning" } });
  const completed = project(succeeded, [started, terminal], 3);
  assert.ok(completed);
  assert.equal(completed.type, "dev.aiprocess.event.attempt.completed.v1");
  assert.equal(completed.causationId, terminal.eventId);

  for (const [status, findingCode] of [["failed", "runtime-failed"], ["cancelled", "user-cancelled"], ["blocked", "approval-required"]] as const) {
    const event = workflowEvent(4, { type: "run.finished", run: { status, findingCode } });
    const fact = project(event, [started, terminal], 4);
    assert.ok(fact);
    assert.equal(fact.type, "dev.aiprocess.event.attempt.failed.v1");
    assert.equal("failureCode" in fact.data && fact.data.failureCode, findingCode);
  }
});
