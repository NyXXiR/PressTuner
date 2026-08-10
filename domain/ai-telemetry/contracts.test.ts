import assert from "node:assert/strict";
import test from "node:test";
import { parseCanonicalAiTelemetryEvent } from "./contracts";
import { deriveCanonicalEventId } from "./identifiers";

const valid = () => ({ schemaVersion: "ai-telemetry-event/v1", eventId: deriveCanonicalEventId("test"), eventKind: "run.lifecycle", traceId: "a".repeat(32), spanId: "b".repeat(16), parentSpanId: null, sequence: 1, occurredAt: "2026-08-06T00:00:00.000Z", scope: { teamId: "team", runId: "run", processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", attemptId: "attempt", parentAttemptId: null, caseId: null }, executionMode: "LIVE", status: "STARTED", attributes: { "domain.node.id": "start" }, payload: { phase: "STARTED", reasonCode: null } });

test("canonical envelope is strict and validates identity and time", () => {
  assert.equal(parseCanonicalAiTelemetryEvent(valid()).eventKind, "run.lifecycle");
  assert.throws(() => parseCanonicalAiTelemetryEvent({ ...valid(), extra: true }));
  assert.throws(() => parseCanonicalAiTelemetryEvent({ ...valid(), occurredAt: "yesterday" }));
  assert.throws(() => parseCanonicalAiTelemetryEvent({ ...valid(), traceId: "uuid" }));
});

test("lineage, privacy attributes and terminal status fail closed", () => {
  assert.throws(() => parseCanonicalAiTelemetryEvent({ ...valid(), parentSpanId: "b".repeat(16) }));
  assert.throws(() => parseCanonicalAiTelemetryEvent({ ...valid(), attributes: { prompt: "secret" } }));
  assert.throws(() => parseCanonicalAiTelemetryEvent({ ...valid(), payload: { phase: "COMPLETED", reasonCode: null }, status: "RUNNING" }));
});

test("legacy edge telemetry defaults to a taken traversal", () => {
  const event = parseCanonicalAiTelemetryEvent({ ...valid(), eventKind: "edge.traversed", status: "COMPLETED", parentSpanId: "c".repeat(16), payload: { edgeId: "brief-draft", sourceNodeId: "brief-normalization", targetNodeId: "draft-generation", verdict: "PASS", acknowledged: false } });
  assert.equal(event.eventKind === "edge.traversed" && event.payload.traversalState, "TAKEN");
});
