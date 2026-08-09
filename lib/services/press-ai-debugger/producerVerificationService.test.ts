import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalAiTelemetryEvent } from "@/domain/ai-telemetry/contracts";
import { createProducerVerificationService } from "./producerVerificationService";

const startEvent: CanonicalAiTelemetryEvent = {
  schemaVersion: "ai-telemetry-event/v1",
  eventId: "aevt_000000000000000000000000000000000000000000000000",
  eventKind: "run.lifecycle",
  traceId: "123e4567e89b12d3a456426614174000",
  spanId: "abcdef0123456789",
  parentSpanId: null,
  sequence: 1,
  occurredAt: "2026-08-09T00:00:00.000Z",
  scope: {
    teamId: "private-team-id",
    runId: "private-run-id",
    processId: "press-creation",
    processVersion: "2.0.0",
    registryHash: "fnv1a32:12345678",
    attemptId: "private-attempt-id",
    parentAttemptId: null,
    caseId: null,
  },
  executionMode: "LIVE",
  status: "STARTED",
  attributes: { safe: "PROMPT_SENTINEL", arbitrary: "BEARER_SENTINEL" },
  payload: { phase: "STARTED", reasonCode: null },
};

test("saved canonical telemetry produces only an allowlisted local verification report", async () => {
  const verify = createProducerVerificationService({
    environment: {},
    loadAttempt: async () => ({
      processId: "press-creation",
      processVersion: "2.0.0",
      registryHash: "fnv1a32:deadbeef",
      runId: "private-run-id",
      runInput: { operationId: "private-operation-id", prompt: "PROMPT_SENTINEL" },
    }),
    loadCanonicalRows: async () => [{ details: startEvent }, { details: { prompt: "GENERATED_SENTINEL" } }],
    loadFailureRows: async () => [{ details: { phase: "FACT", errorCode: "RAW_ERROR_SENTINEL" } }],
  });

  const report = await verify({ teamId: "private-team-id", attemptId: "private-attempt-id" });
  assert.equal(report.schemaVersion, "presstuner/producer-verification/v1");
  assert.equal(report.canonical.status, "invalid");
  assert.equal(report.delivery.operationConfiguration, "disabled");
  assert.equal(report.delivery.otlpConfiguration, "disabled");
  assert.equal(report.delivery.operationLinkage, "disabled");
  assert.equal(report.delivery.factDelivery, "failed");
  assert.equal(report.delivery.otlpDelivery, "disabled");
  assert.equal(report.delivery.completionDelivery, "disabled");
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "PROMPT_SENTINEL", "GENERATED_SENTINEL", "BEARER_SENTINEL", "RAW_ERROR_SENTINEL",
    "private-team-id", "private-run-id", "private-attempt-id", "private-operation-id",
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden));
  assert.doesNotMatch(serialized, /success|exported|delivered/);
});

test("missing and other-team attempts share the same sanitized not-found error", async () => {
  const verify = createProducerVerificationService({
    environment: {},
    loadAttempt: async () => null,
    loadCanonicalRows: async () => { throw new Error("must not load"); },
    loadFailureRows: async () => { throw new Error("must not load"); },
  });
  await assert.rejects(
    verify({ teamId: "other-team", attemptId: "known-attempt" }),
    (error: Error & { status?: number; code?: string }) => error.status === 404 && error.code === "PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND",
  );
});

test("valid saved telemetry is replay-safe and never causes outbound delivery", async () => {
  let outbound = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { outbound += 1; throw new Error("must not fetch"); };
  const verify = createProducerVerificationService({
    environment: {
      OPS_CONSOLE_AI_OPERATIONS_URL: "https://ops.example.test/api",
      OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "secret-key",
      OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT: "test",
      OPS_CONSOLE_OTLP_TRACES_URL: "https://ops.example.test/v1/traces",
    },
    loadAttempt: async () => ({ processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:deadbeef", runId: "private-run-id", runInput: { prompt: "PROMPT_SENTINEL" } }),
    loadCanonicalRows: async () => [{ details: startEvent }],
    loadFailureRows: async () => [],
  });
  const report = await verify({ teamId: "private-team-id", attemptId: "private-attempt-id" }).finally(() => { globalThis.fetch = originalFetch; });
  assert.equal(outbound, 0);
  assert.equal(report.canonical.status, "observed");
  assert.equal(report.facts.status, "ready");
  assert.equal(report.facts.factCount, 1);
  assert.equal(report.otlp.status, "ready");
  assert.equal(report.otlp.contentFree, true);
  assert.equal(report.delivery.operationLinkage, "not_observed");
  assert.equal(report.delivery.factDelivery, "not_observed");
  assert.equal(report.delivery.otlpDelivery, "not_observed");
  assert.equal(report.delivery.completionDelivery, "not_observed");
});

test("canonical volume is bounded without partial projection", async () => {
  const verify = createProducerVerificationService({
    environment: {},
    loadAttempt: async () => ({ processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:deadbeef", runId: "private-run-id", runInput: {} }),
    loadCanonicalRows: async () => Array.from({ length: 10_001 }, () => ({ details: startEvent })),
    loadFailureRows: async () => [],
  });
  const report = await verify({ teamId: "private-team-id", attemptId: "private-attempt-id" });
  assert.equal(report.canonical.status, "limit_exceeded");
  assert.equal(report.facts.status, "limit_exceeded");
  assert.equal(report.otlp.status, "limit_exceeded");
  assert.equal(report.replay.canonicalCount, 0);
  assert.equal(report.replay.uniqueDeterministicFactCount, 0);
  assert.equal(report.replay.aggregateSpanCount, 0);
});
