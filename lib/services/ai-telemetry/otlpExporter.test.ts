import assert from "node:assert/strict";
import test from "node:test";
import { createOtlpExporter, readOtlpExporterConfiguration } from "./otlpExporter";
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
    readTelemetry: async () => [baseEvent],
    fetch: async (url, init) => { captured.value = { url: String(url), init: init as RequestInit }; return new Response(null, { status: 200 }); },
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "exported", spans: 1 });
  assert.equal(captured.value?.url, "https://ops.test/v1/traces");
  assert.equal((captured.value?.init.headers as Record<string, string>).authorization, "Bearer write-key");
  assert.equal((captured.value?.init.headers as Record<string, string>)["content-type"], "application/json");
  const body = JSON.parse(String(captured.value?.init.body));
  assert.equal(body.resourceSpans[0].scopeSpans[0].spans.length, 1);
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

test("exportRunTelemetry reads and exports events in batches", async () => {
  const calls: Array<{ afterSequence?: number; limit?: number }> = [];
  const events = Array.from({ length: 250 }, (_, index) => ({ ...baseEvent, sequence: index + 1, eventId: `aevt_${index.toString().padStart(56, "0")}` }));
  const exporter = createOtlpExporter({
    environment: { OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.test/v1/traces", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key" },
    readTelemetry: async (args) => {
      calls.push(args);
      const start = args.afterSequence ?? 0;
      return events.filter((event) => event.sequence > start).slice(0, args.limit);
    },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const spanCount = body.resourceSpans[0]?.scopeSpans[0]?.spans.length ?? 0;
      return new Response(JSON.stringify({ spanCount }), { status: 200 });
    },
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "exported", spans: 250 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { teamId: "team", runId: "run", limit: 200 });
  assert.deepEqual(calls[1], { teamId: "team", runId: "run", afterSequence: 200, limit: 200 });
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
    fetch: async (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError"))); }),
  });
  const result = await exporter.exportRunTelemetry({ teamId: "team", runId: "run" });
  assert.deepEqual(result, { status: "failed", code: "OTLP_TIMEOUT", retryable: true });
});
