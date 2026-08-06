import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalAiTelemetryEventSchema } from "./contracts";
import { buildOtlpTraceRequest } from "./otlpProjection";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...base, ...overrides };
}

const base = {
  schemaVersion: "ai-telemetry-event/v1" as const,
  eventId: "aevt_000000000000000000000000000000000000000000000000",
  eventKind: "run.lifecycle" as const,
  traceId: "123e4567e89b12d3a456426614174000",
  spanId: "abcdef0123456789",
  parentSpanId: null,
  sequence: 1,
  occurredAt: "2026-08-06T12:00:00.000Z",
  scope: {
    teamId: "team",
    runId: "run",
    processId: "press-creation",
    processVersion: "2.0.0",
    registryHash: "fnv1a32:12345678",
    attemptId: "attempt",
    parentAttemptId: null,
    caseId: null,
  },
  executionMode: "LIVE" as const,
  status: "STARTED" as const,
  attributes: {},
  payload: { phase: "STARTED", reasonCode: null } as const,
};

test("converts a canonical run event to an OTLP span with base64 IDs", () => {
  const parsed = CanonicalAiTelemetryEventSchema.parse(event());
  const request = buildOtlpTraceRequest([parsed]);
  assert.equal(request.resourceSpans.length, 1);
  const span = request.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.equal(span.traceId, Buffer.from("123e4567e89b12d3a456426614174000", "hex").toString("base64"));
  assert.equal(span.spanId, Buffer.from("abcdef0123456789", "hex").toString("base64"));
  assert.equal(span.name, "run.lifecycle");
  assert.equal(span.kind, 1);
  assert.equal(span.status.code, 1);
  assert.equal(span.startTimeUnixNano, String(BigInt(new Date("2026-08-06T12:00:00.000Z").getTime()) * BigInt(1_000_000)));
  assert.equal(span.endTimeUnixNano, span.startTimeUnixNano);
});

test("converts parentSpanId when present", () => {
  const parsed = CanonicalAiTelemetryEventSchema.parse(event({
    eventKind: "span.lifecycle",
    spanId: "abcdef0123456789",
    parentSpanId: "fedcba9876543210",
    status: "STARTED",
    payload: { phase: "STARTED", spanKind: "CHAIN", operationName: "verify", nodeId: "node-1", reasonCode: null },
  }));
  const request = buildOtlpTraceRequest([parsed]);
  const span = request.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.equal(span.parentSpanId, Buffer.from("fedcba9876543210", "hex").toString("base64"));
});

test("maps failed status to error", () => {
  const parsed = CanonicalAiTelemetryEventSchema.parse(event({ status: "FAILED", payload: { phase: "FAILED", reasonCode: "test" } }));
  const request = buildOtlpTraceRequest([parsed]);
  const span = request.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  assert.equal(span.status.code, 2);
  assert.equal(span.status.message, "FAILED");
});

test("flattens payload and event attributes into OTLP attributes", () => {
  const parsed = CanonicalAiTelemetryEventSchema.parse(event({
    eventKind: "span.lifecycle",
    status: "COMPLETED",
    payload: { phase: "COMPLETED", spanKind: "CHAIN", operationName: "verify", nodeId: "node-1", reasonCode: null },
    attributes: { "domain.node.id": "node-1" },
  }));
  const request = buildOtlpTraceRequest([parsed]);
  const span = request.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  const keys = new Set(span.attributes.map((attr) => attr.key));
  assert.ok(keys.has("ai.telemetry.event_kind"));
  assert.ok(keys.has("ai.telemetry.payload.phase"));
  assert.ok(keys.has("ai.telemetry.payload.operationName"));
  assert.ok(keys.has("domain.node.id"));
});

test("allowlists OTLP attributes without tenant, run, case, attempt, actor, or evidence values", () => {
  const parsed = CanonicalAiTelemetryEventSchema.parse({
    ...event(),
    eventKind: "transition.evaluation",
    parentSpanId: "fedcba9876543210",
    status: "BLOCK",
    scope: { ...base.scope, teamId: "tenant-secret", runId: "run-secret", attemptId: "attempt-secret", parentAttemptId: "parent-attempt-secret", caseId: "case-secret" },
    attributes: { "domain.edge.id": "edge-safe", "domain.node.id": "node-safe", "domain.command.id_hash": "command-secret" },
    payload: {
      edgeId: "edge-safe",
      evaluator: { id: "grounding", version: "1.0.0" },
      score: { value: 0, label: "BLOCK" },
      verdict: "BLOCK",
      evidence: [{ sourceField: "private-field", factKind: "TEXT", factValue: "raw-evidence-secret", factHash: "a".repeat(64), matchStatus: "MISSING", reasonCode: "MISSING_FACT" }],
      evidenceOverflow: 0,
      reasonCode: "MISSING_FACT",
    },
  });
  const request = buildOtlpTraceRequest([parsed]);
  const span = request.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  const keys = new Set(span.attributes.map((attr) => attr.key));
  assert.ok(!keys.has("service.team_id"));
  assert.ok(!keys.has("service.run_id"));
  assert.ok(!keys.has("service.attempt_id"));
  assert.ok(!keys.has("ai.telemetry.event_id"));
  assert.ok(!keys.has("domain.command.id_hash"));
  assert.ok(keys.has("domain.edge.id"));
  assert.ok(keys.has("ai.telemetry.payload.evaluator.id"));
  const serialized = JSON.stringify(request);
  for (const secret of ["tenant-secret", "run-secret", "attempt-secret", "parent-attempt-secret", "case-secret", "command-secret", "private-field", "raw-evidence-secret"]) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
});
