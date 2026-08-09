import assert from "node:assert/strict";
import test from "node:test";
import { OtlpTraceRequestSchema } from "@nyxxir/ops-producer";
import { createOtlpExporter, prepareContentFreeOtlpProjection, readOtlpExporterConfiguration } from "./otlpExporter";
import type { CanonicalAiTelemetryEvent } from "@/domain/ai-telemetry/contracts";

const baseEvent: CanonicalAiTelemetryEvent = {
  schemaVersion: "ai-telemetry-event/v1",
  eventId: "aevt_000000000000000000000000000000000000000000000000",
  eventKind: "run.lifecycle",
  traceId: "123e4567e89b12d3a456426614174000",
  spanId: "abcdef0123456789",
  parentSpanId: null,
  sequence: 1,
  occurredAt: "2026-08-06T12:00:00.000Z",
  scope: { teamId: "team", runId: "run", processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", attemptId: "attempt", parentAttemptId: null, caseId: null },
  executionMode: "LIVE",
  status: "STARTED",
  attributes: {},
  payload: { phase: "STARTED", reasonCode: null },
};

test("readOtlpExporterConfiguration returns null for missing config", () => {
  assert.equal(readOtlpExporterConfiguration({}), null);
  assert.equal(readOtlpExporterConfiguration({ OPS_CONSOLE_OTLP_TRACES_URL: "not-a-url", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key" }), null);
  assert.equal(readOtlpExporterConfiguration({ OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key\nheader" }), null);
  assert.equal(readOtlpExporterConfiguration({ OPS_CONSOLE_OTLP_TRACES_URL: "http://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key" }), null);
});

test("readOtlpExporterConfiguration permits HTTP only on explicit loopback hosts", () => {
  for (const url of [
    "http://localhost:3000/v1/traces",
    "http://127.0.0.1:3000/v1/traces",
    "http://[::1]:3000/v1/traces",
  ]) {
    assert.equal(readOtlpExporterConfiguration({
      OPS_CONSOLE_OTLP_TRACES_URL: url,
      OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key",
    })?.baseUrl, url);
  }
});

test("readOtlpExporterConfiguration parses valid config", () => {
  const config = readOtlpExporterConfiguration({
    OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces",
    OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key",
    OPS_CONSOLE_OTLP_TRACES_TIMEOUT_MS: "5000",
    OPS_CONSOLE_OTLP_TRACES_SAMPLE_RATE: "0.5",
    OPS_CONSOLE_OTLP_TRACES_RETRY_MAX_ATTEMPTS: "5",
    OPS_CONSOLE_OTLP_TRACES_RETRY_BASE_MS: "250",
  });
  assert.deepEqual(config, { baseUrl: "https://ops.test/v1/traces", writeKey: "write-key", timeoutMs: 5000, sampleRate: 0.5, retryMaxAttempts: 5, retryBaseMs: 250 });
});

test("readOtlpExporterConfiguration clamps sample rate", () => {
  assert.equal(readOtlpExporterConfiguration({ OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key", OPS_CONSOLE_OTLP_TRACES_SAMPLE_RATE: "2" })?.sampleRate, 1);
  assert.equal(readOtlpExporterConfiguration({ OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key", OPS_CONSOLE_OTLP_TRACES_SAMPLE_RATE: "-0.5" })?.sampleRate, 0);
});

test("readOtlpExporterConfiguration bounds retry attempts", () => {
  const common = {
    OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces",
    OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key",
  };
  assert.equal(readOtlpExporterConfiguration({ ...common, OPS_CONSOLE_OTLP_TRACES_RETRY_MAX_ATTEMPTS: "999999" })?.retryMaxAttempts, 10);
  assert.equal(readOtlpExporterConfiguration({ ...common, OPS_CONSOLE_OTLP_TRACES_RETRY_MAX_ATTEMPTS: "-3" })?.retryMaxAttempts, 0);
});

test("exportRunTelemetry is disabled without configuration", async () => {
  const exporter = createOtlpExporter({ environment: {} });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "disabled" });
});

test("exportRunTelemetry samples out runs below the sample rate", async () => {
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key", OPS_CONSOLE_OTLP_TRACES_SAMPLE_RATE: "0" },
    readTelemetry: async () => { throw new Error("should not read"); },
    fetch: async () => { throw new Error("should not fetch"); },
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "sampled_out" });
});

test("exportRunTelemetry sends OTLP trace request and returns exported span count", async () => {
  const captured: { value?: { url: string; init: RequestInit } } = {};
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async () => [{
      ...baseEvent,
      scope: { ...baseEvent.scope, teamId: "private-team-do-not-send", runId: "private-run-do-not-send" },
      attributes: { "private.prompt": "private-prompt-do-not-send" },
    }],
    fetch: async (url, init) => { captured.value = { url: String(url), init: init as RequestInit }; return new Response(null, { status: 200 }); },
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "exported", spans: 1 });
  assert.equal(captured.value?.url, "https://ops.test/v1/traces");
  assert.equal((captured.value?.init.headers as Record<string, string>).authorization, "Bearer write-key");
  assert.equal((captured.value?.init.headers as Record<string, string>)["content-type"], "application/json");
  const body = JSON.parse(String(captured.value?.init.body));
  OtlpTraceRequestSchema.parse(body);
  assert.equal(body.resourceSpans[0].scopeSpans[0].spans.length, 1);
  assert.deepEqual(body.resourceSpans[0].resource.attributes, []);
  assert.deepEqual(body.resourceSpans[0].scopeSpans[0].spans[0].attributes, []);
  assert.equal("events" in body.resourceSpans[0].scopeSpans[0].spans[0], false);
  assert.equal("links" in body.resourceSpans[0].scopeSpans[0].spans[0], false);
  assert.doesNotMatch(JSON.stringify(body), /private-(?:team|run|prompt)-do-not-send/);
});

test("exportRunTelemetry aggregates lifecycle events into one span identity", async () => {
  let body: any;
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async () => [
      baseEvent,
      { ...baseEvent, eventId: "aevt_111111111111111111111111111111111111111111111111", sequence: 2, occurredAt: "2026-08-06T12:00:01.000Z", status: "COMPLETED", payload: { phase: "COMPLETED", reasonCode: null } },
    ],
    fetch: async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(null, { status: 200 }); },
  });

  assert.deepEqual(await exporter.exportRunTelemetry({ teamId: "team", runId: "run" }), { status: "exported", spans: 1 });
  const [span] = body.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(span.startTimeUnixNano, "1786017600000000000");
  assert.equal(span.endTimeUnixNano, "1786017601000000000");
  assert.equal(span.status.code, 1);
});

test("dry-run OTLP preparation shares exporter aggregation and remains content-free", () => {
  const projection = prepareContentFreeOtlpProjection([
    { ...baseEvent, attributes: { arbitrary: "private-content-sentinel" } },
    { ...baseEvent, eventId: "aevt_111111111111111111111111111111111111111111111111", sequence: 2, occurredAt: "2026-08-06T12:00:01.000Z", status: "COMPLETED", payload: { phase: "COMPLETED", reasonCode: null } },
  ]);
  assert.equal(projection.spanCount, 1);
  assert.equal(projection.requestCount, 1);
  const serialized = JSON.stringify(projection.requests);
  assert.doesNotMatch(serialized, /private-content-sentinel|private-team|private-run/);
  const span = projection.requests[0]?.resourceSpans[0]?.scopeSpans[0]?.spans[0];
  assert.deepEqual(span?.attributes, []);
  assert.equal(span && "events" in span, false);
  assert.equal(span && "links" in span, false);
});

test("dry-run OTLP preparation handles empty and rejects inconsistent identities", () => {
  assert.deepEqual(prepareContentFreeOtlpProjection([]), { requests: [], spanCount: 0, requestCount: 0 });
  assert.throws(() => prepareContentFreeOtlpProjection([
    baseEvent,
    { ...baseEvent, eventId: "aevt_222222222222222222222222222222222222222222222222", parentSpanId: "1111111111111111", sequence: 2 },
  ]));
});

test("exportRunTelemetry returns empty when no events", async () => {
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async () => [],
    fetch: async () => new Response(null, { status: 200 }),
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "empty" });
});

test("exportRunTelemetry reads and exports unique events in batches", async () => {
  const calls: Array<{ afterSequence?: number; limit?: number }> = [];
  const events = Array.from({ length: 250 }, (_, index) => ({
    ...baseEvent,
    sequence: index + 1,
    eventId: `aevt_${index.toString().padStart(48, "0")}`,
    spanId: (index + 1).toString(16).padStart(16, "0"),
  }));
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async (args) => {
      calls.push(args);
      const start = args.afterSequence ?? 0;
      return events.filter((event) => event.sequence > start).slice(0, (args.limit ?? 100));
    },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const spanCount = body.resourceSpans[0]?.scopeSpans[0]?.spans.length ?? 0;
      return new Response(JSON.stringify({ spanCount }), { status: 200 });
    },
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "exported", spans: 250 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], { teamId: "team", runId: "run", limit: 100 });
  assert.deepEqual(calls[1], { teamId: "team", runId: "run", afterSequence: 100, limit: 100 });
  assert.deepEqual(calls[2], { teamId: "team", runId: "run", afterSequence: 200, limit: 100 });
});

test("exportRunTelemetry fails closed when canonical event volume exceeds 10k", async () => {
  let fetched = false;
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async (args) => {
      const start = args.afterSequence ?? 0;
      if (start >= 10_001) return [];
      return Array.from({ length: Math.min((args.limit ?? 100), 10_001 - start) }, (_, index) => ({
        ...baseEvent,
        sequence: start + index + 1,
        spanId: (start + index + 1).toString(16).padStart(16, "0"),
      }));
    },
    fetch: async () => { fetched = true; return new Response(null, { status: 200 }); },
  });
  assert.deepEqual(await exporter.exportRunTelemetry({ teamId: "team", runId: "run" }), {
    status: "failed",
    code: "CANONICAL_EVENT_LIMIT_EXCEEDED",
    retryable: false,
  });
  assert.equal(fetched, false);
});

test("exportRunTelemetry retries retryable HTTP errors and succeeds", async () => {
  let attempts = 0;
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key", OPS_CONSOLE_OTLP_TRACES_RETRY_BASE_MS: "1" },
    readTelemetry: async () => [baseEvent],
    fetch: async () => { attempts += 1; return attempts < 3 ? new Response("error", { status: 503 }) : new Response(null, { status: 200 }); },
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "exported", spans: 1 });
  assert.equal(attempts, 3);
});

test("exportRunTelemetry fails safely after exhausting retries", async () => {
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key", OPS_CONSOLE_OTLP_TRACES_RETRY_BASE_MS: "1" },
    readTelemetry: async () => [baseEvent],
    fetch: async () => new Response("error", { status: 503 }),
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "failed", code: "OTLP_HTTP_ERROR", retryable: true });
});

test("exportRunTelemetry fails safely on non-retryable HTTP error", async () => {
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async () => [baseEvent],
    fetch: async () => new Response("bad request", { status: 400 }),
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "failed", code: "OTLP_HTTP_ERROR", retryable: false });
});

test("exportRunTelemetry fails safely on timeout", async () => {
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key", OPS_CONSOLE_OTLP_TRACES_TIMEOUT_MS: "1" },
    readTelemetry: async () => [baseEvent],
    fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError"))); }),
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "failed", code: "OTLP_TIMEOUT", retryable: true });
});
