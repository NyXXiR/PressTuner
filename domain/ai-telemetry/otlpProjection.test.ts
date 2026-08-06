import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalAiTelemetryEventSchema } from "./contracts";
import { buildOtlpTraceRequest } from "./otlpProjection";

function event(overrides: Partial<typeof base> = {}): typeof base {
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
  assert.equal(span.startTimeUnixNano, String(BigInt(new Date("2026-08-06T12:00:00.000Z").getTime()) * 1_000_000n));
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

test("does not expose tenant or run identifiers in OTLP attributes", () => {
  const parsed = CanonicalAiTelemetryEventSchema.parse(event());
  const request = buildOtlpTraceRequest([parsed]);
  const span = request.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
  const keys = new Set(span.attributes.map((attr) => attr.key));
  assert.ok(!keys.has("service.team_id"));
  assert.ok(!keys.has("service.run_id"));
});
