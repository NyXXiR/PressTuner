import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESS_AGENT_WORKFLOW_EDGES,
  PRESS_AGENT_WORKFLOW_STAGE_IDS,
  parsePressAgentWorkflowEvent,
  projectPressAgentWorkflow,
} from "./pressAgentWorkflowEvents";

const base = {
  schemaVersion: "press-agent-workflow-event/v1" as const,
  runId: "run-1",
  occurredAt: "2026-08-06T00:00:00.000Z",
};

function event(sequence: number, value: Record<string, unknown>) {
  return parsePressAgentWorkflowEvent({
    ...base,
    eventId: `event-${sequence}`,
    dedupeKey: `key-${sequence}`,
    sequence,
    ...value,
  });
}

test("strictly accepts only the safe versioned public envelope", () => {
  const started = event(1, { type: "run.started", run: { status: "running" } });
  assert.equal(started.type, "run.started");
  assert.throws(() => parsePressAgentWorkflowEvent({ ...started, prompt: "secret" }));
  assert.throws(() => event(2, {
    type: "stage.state",
    stage: { id: "retrieval-execution", state: "running", findingCode: null, metrics: { sourceName: 1 } },
  }));
  assert.throws(() => event(2, {
    type: "run.finished",
    run: { status: "failed", findingCode: "arbitrary exception" },
  }));
});

test("projects all seven nodes, stable edges, violations, and skipped fallback", () => {
  const projection = projectPressAgentWorkflow([
    event(5, { type: "edge.state", edge: { id: "verification-fallback", source: "verification", target: "fallback", state: "not-taken", findingCode: null } }),
    event(1, { type: "run.started", run: { status: "running" } }),
    event(2, { type: "stage.state", stage: { id: "request-intake", state: "succeeded", findingCode: null } }),
    event(3, { type: "stage.state", stage: { id: "verification", state: "warning", findingCode: "claim-verification-failed", metrics: { claims: 2, supportedClaims: 1 } } }),
    event(4, { type: "edge.state", edge: { id: "verification-terminal", source: "verification", target: "terminal-evaluation", state: "taken-with-violation", findingCode: "claim-verification-failed" } }),
    event(6, { type: "stage.state", stage: { id: "fallback", state: "skipped", findingCode: "fallback-not-needed" } }),
  ]);
  assert.equal(Object.keys(projection.stages).length, PRESS_AGENT_WORKFLOW_STAGE_IDS.length);
  assert.equal(Object.keys(projection.edges).length, PRESS_AGENT_WORKFLOW_EDGES.length);
  assert.equal(projection.stages.verification.state, "warning");
  assert.equal(projection.edges["verification-terminal"].state, "taken-with-violation");
  assert.equal(projection.stages.fallback.state, "skipped");
  assert.equal(projection.lastSequence, 6);
});

test("deduplicates, sorts by sequence, and makes terminal state absorbing", () => {
  const finished = event(3, { type: "run.finished", run: { status: "cancelled", findingCode: "user-cancelled" } });
  const projection = projectPressAgentWorkflow([
    finished,
    event(2, { type: "stage.state", stage: { id: "response-behavior", state: "blocked", findingCode: "user-cancelled" } }),
    event(1, { type: "run.started", run: { status: "running" } }),
    { ...finished, eventId: "different-id" },
    event(4, { type: "run.finished", run: { status: "succeeded", findingCode: null } }),
  ]);
  assert.equal(projection.runStatus, "cancelled");
  assert.equal(projection.lastSequence, 3);
  assert.equal(projection.stages["response-behavior"].state, "blocked");
});

test("stalled is health derived from injected time and never mutates workflow state", () => {
  const events = [event(1, { type: "run.started", run: { status: "running" } })];
  assert.equal(projectPressAgentWorkflow(events, { now: new Date("2026-08-06T00:00:29Z") }).stalled, false);
  const stalled = projectPressAgentWorkflow(events, { now: new Date("2026-08-06T00:00:31Z") });
  assert.equal(stalled.stalled, true);
  assert.ok(Object.values(stalled.stages).every((stage) => stage.state === "waiting"));
});
