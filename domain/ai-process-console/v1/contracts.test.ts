import assert from "node:assert/strict";
import test from "node:test";
import {
  EventV1Schema,
  MemoSourcePolicyV1Schema,
  ObservabilityReferenceV1Schema,
  ObservabilityReferencesV1Schema,
  ProjectIntegrationManifestV1Schema,
  TestRunRequestedCommandV1Schema,
  findForbiddenIntegrationPaths,
  resolveObservabilityReferencesV1,
} from "./contracts";
import { buildProjectManifest, memoSourcePolicy } from "./publication";

const technical = { provider: "LANGSMITH" as const, traceId: "trace-1", spanId: "span-1" };
const posthog = { provider: "POSTHOG" as const, metricKey: "attempt-success", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z" };
const event = { specversion: "1.0", id: "event-1", source: "urn:presstuner:ai-process-console", subject: "attempts/attempt-1", time: "2030-01-01T00:00:00.000Z", schemaVersion: "1.0", correlationId: "correlation-1", sequence: 1, executionMode: "TEST", type: "dev.aiprocess.event.attempt.started.v1", data: { attemptId: "attempt-1" } };
const artifact = { artifactId: "artifact-1", schemaVersion: "1.0", sha256: "a".repeat(64), mediaType: "application/json", sizeBytes: 1, locator: "ref:artifacts/1" };
const command = { ...event, id: "command-1", type: "dev.aiprocess.command.test-run.requested.v1", data: { testRunId: "test-run-1", projectId: "presstuner", processDefinition: artifact, fixture: { ...artifact, artifactId: "fixture-1", locator: "ref:fixtures/1" } } };

test("strict local v1 schemas reject unknown and forbidden integration keys", () => {
  assert.equal(ProjectIntegrationManifestV1Schema.safeParse({ ...buildProjectManifest(), unexpected: true }).success, false);
  assert.deepEqual(findForbiddenIntegrationPaths({ nested: { callbackUrl: "do-not-retain", prompt: "do-not-retain" } }), ["$.nested.callbackUrl", "$.nested.prompt"]);
  assert.equal(MemoSourcePolicyV1Schema.safeParse({ ...memoSourcePolicy, unexpected: true }).success, false);
});

test("the event union accepts only past-tense facts", () => {
  assert.equal(EventV1Schema.safeParse({ type: "dev.aiprocess.command.node-execution.requested.v1" }).success, false);
});

test("observability carriers validate intervals and resolve in deterministic order", () => {
  for (const invalid of [
    { ...posthog, windowEnd: posthog.windowStart },
    { ...posthog, windowEnd: "2029-12-31T23:59:59.999Z" },
  ]) {
    assert.equal(ObservabilityReferenceV1Schema.safeParse(invalid).success, false);
    assert.equal(ObservabilityReferencesV1Schema.safeParse([invalid]).success, false);
    assert.throws(() => resolveObservabilityReferencesV1({ trace: invalid }), /window/i);
  }
  assert.deepEqual(resolveObservabilityReferencesV1({ trace: posthog, observabilityReferences: [technical] }), [technical, posthog]);
  assert.deepEqual(resolveObservabilityReferencesV1({ trace: technical, observabilityReferences: [technical, posthog] }), [technical, posthog]);
});

test("observability carriers reject unequal technical and PostHog references", () => {
  for (const carrier of [
    { trace: technical, observabilityReferences: [{ ...technical, traceId: "trace-2" }] },
    { trace: technical, observabilityReferences: [{ provider: "OPENTELEMETRY" as const, traceId: "trace-1", spanId: "span-1" }] },
    { observabilityReferences: [technical, { ...technical, spanId: "span-2" }] },
    { trace: posthog, observabilityReferences: [{ ...posthog, metricKey: "other-metric" }] },
  ]) assert.throws(() => resolveObservabilityReferencesV1(carrier), /conflict/i);
});

test("event and command envelopes reject cross-carrier conflicts", () => {
  const conflict = { trace: technical, observabilityReferences: [{ ...technical, traceId: "trace-2" }] };
  assert.equal(EventV1Schema.safeParse({ ...event, ...conflict }).success, false);
  assert.equal(TestRunRequestedCommandV1Schema.safeParse({ ...command, ...conflict }).success, false);
  assert.equal(TestRunRequestedCommandV1Schema.safeParse({ ...command, trace: technical, observabilityReferences: [technical] }).success, true);
});
