import assert from "node:assert/strict";
import test from "node:test";

import { parsePressAiProcessEvent, projectPressAiProcessEvents } from "./processEvents";

const base = { schemaVersion: "press-ai-process-event/v1", processId: "press-creation", processVersion: "1.0.0", eventId: "e1", dedupeKey: "d1", runId: "r1", sequence: 1, occurredAt: "2026-08-06T00:00:00.000Z" } as const;

test("strict parser validates registry topology, version and metric identities", () => {
  assert.equal(parsePressAiProcessEvent({ ...base, type: "node.state", node: { id: "brief-normalization", state: "running", findingCode: null, metrics: { factCandidates: 2 } } }).type, "node.state");
  assert.throws(() => parsePressAiProcessEvent({ ...base, type: "edge.state", edge: { id: "brief-draft", source: "draft-generation", target: "brief-normalization", state: "taken", findingCode: null } }), /TOPOLOGY_INVALID/);
  assert.throws(() => parsePressAiProcessEvent({ ...base, type: "node.state", node: { id: "brief-normalization", state: "running", findingCode: null, metrics: { tokens: 2 } } }), /METRIC_INVALID/);
});

test("projector deduplicates and absorbs terminal state", () => {
  const started = parsePressAiProcessEvent({ ...base, type: "run.started", run: { status: "running" } });
  const finished = parsePressAiProcessEvent({ ...base, eventId: "e2", dedupeKey: "d2", sequence: 2, type: "run.finished", run: { status: "succeeded", findingCode: null } });
  const late = parsePressAiProcessEvent({ ...base, eventId: "e3", dedupeKey: "d3", sequence: 3, type: "node.state", node: { id: "brief-normalization", state: "failed", findingCode: null } });
  const projection = projectPressAiProcessEvents("press-creation", [started, started, finished, late]);
  assert.equal(projection.runStatus, "succeeded");
  assert.equal(projection.nodes["brief-normalization"].state, "waiting");
});

test("waiting input is projected as a real gate", () => {
  const event = parsePressAiProcessEvent({ ...base, type: "run.waiting-input", gate: { id: "confirm-normalized-brief", nodeId: "brief-normalization" } });
  const projection = projectPressAiProcessEvents("press-creation", [event]);
  assert.equal(projection.runStatus, "waiting-input");
  assert.equal(projection.waitingGate?.id, "confirm-normalized-brief");
});

test("content-free human review clears the waiting gate and remains dedupe-safe", () => {
  const waiting = parsePressAiProcessEvent({ ...base, type: "run.waiting-input", gate: { id: "confirm-normalized-brief", nodeId: "brief-normalization" } });
  const reviewed = parsePressAiProcessEvent({ ...base, eventId: "e2", dedupeKey: "gate:confirmed", sequence: 2, type: "human.reviewed", gate: { id: "confirm-normalized-brief", nodeId: "brief-normalization" }, decision: "APPROVED" });
  const projection = projectPressAiProcessEvents("press-creation", [waiting, reviewed, reviewed]);
  assert.equal(projection.runStatus, "running");
  assert.equal(projection.waitingGate, null);
  assert.doesNotMatch(JSON.stringify(reviewed), /user|actor|memo|content/i);
});

test("legacy RAG v1 remains parseable", () => {
  const event = parsePressAiProcessEvent({ schemaVersion: "press-agent-workflow-event/v1", eventId: "legacy", dedupeKey: "legacy", runId: "r1", sequence: 1, occurredAt: "2026-08-06T00:00:00.000Z", type: "run.started", run: { status: "running" } });
  assert.equal(event.processId, "rag-query");
});
