import assert from "node:assert/strict";
import test from "node:test";
import { EventV1Schema, assertPrivacySafe } from "./contracts";
import { createResolvedFactFactory, createUnresolvedRejectionFact } from "./factEvents";
import { AI_PROCESS_CONSOLE_SOURCE, buildProcessDefinition } from "./publication";

const identity = { caseId: "case-1", objectType: "synthetic-press-fixture", operationId: "operation-1", attemptId: "attempt-1", correlationId: "correlation-1", testRunId: "test-run-1", trace: { provider: "OPENTELEMETRY" as const, traceId: "trace-1", spanId: "span-1", link: { label: "trace", url: "https://example.invalid/trace/1" } } };

test("resolved facts inherit application, case, attempt, process, and event metadata", () => {
  const factory = createResolvedFactFactory({ identity, clock: () => new Date("2030-01-01T00:00:00.000Z") });
  const fact = factory.create({ type: "dev.aiprocess.event.node.execution.completed.v1", logicalKey: "node:one:completed", sequence: 4, data: { nodeId: "draft-generation", handlerRef: "presstuner:handler:press.generate-draft:v1", durationMs: 10 } });
  assert.equal(fact.source, AI_PROCESS_CONSOLE_SOURCE);
  assert.deepEqual(fact.trace, { provider: "OPENTELEMETRY", traceId: "trace-1", spanId: "span-1" });
  assert.equal(factory.identity.trace && "link" in factory.identity.trace, false);
  assert.deepEqual(fact.metadata, { projectId: "presstuner", environment: "conformance", serviceName: "presstuner", caseId: "case-1", objectType: "synthetic-press-fixture", operationId: "operation-1", attemptId: "attempt-1", correlationId: "correlation-1", processId: "press-creation", processVersion: "2.1.0", processDefinitionHash: buildProcessDefinition().canonicalSha256, executionMode: "TEST", testRunId: "test-run-1", traceId: "trace-1", spanId: "span-1", eventId: fact.id, occurredAt: fact.time, eventType: fact.type, sequence: 4, nodeId: "draft-generation" });
  const replay = factory.create({ type: fact.type, logicalKey: "node:one:completed", sequence: 4, data: fact.data, occurredAt: new Date(fact.time) });
  assert.equal(replay.id, fact.id);
});

test("unresolved rejection remains valid without inventing process identity", () => {
  const fact = createUnresolvedRejectionFact({ testRunId: "test-run-2", correlationId: "correlation-2", commandId: "command-123", reasonCode: "DEFINITION_NOT_FOUND", occurredAt: new Date("2030-01-01T00:00:00.000Z") });
  assert.equal(EventV1Schema.safeParse(fact).success, true);
  assert.equal(fact.metadata?.processId, undefined);
  assert.equal(fact.metadata?.processDefinitionHash, undefined);
  assert.equal(fact.metadata?.attemptId, undefined);
});

test("raw or credential-bearing data is rejected before fact creation", () => {
  const factory = createResolvedFactFactory({ identity });
  assert.throws(() => factory.create({ type: "dev.aiprocess.event.node.execution.completed.v1", logicalKey: "unsafe", sequence: 1, data: { nodeId: "draft-generation", handlerRef: "presstuner:handler:x:v1", durationMs: 1, token: "no" } as never }), /Zod|unrecognized/i);
});

test("facts canonicalize both carriers, strip every link, and reconcile technical metadata", () => {
  const posthog = { provider: "POSTHOG" as const, metricKey: "attempt-success", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z", link: { label: "metric", url: "https://example.invalid/posthog/1" } };
  const factory = createResolvedFactFactory({ identity: { ...identity, observabilityReferences: [posthog] } });
  const fact = factory.create({ type: "dev.aiprocess.event.attempt.started.v1", logicalKey: "attempt:started", sequence: 1, data: { attemptId: identity.attemptId } });
  assert.deepEqual(fact.trace, { provider: "OPENTELEMETRY", traceId: "trace-1", spanId: "span-1" });
  assert.deepEqual(fact.observabilityReferences, [{ provider: "POSTHOG", metricKey: "attempt-success", windowStart: posthog.windowStart, windowEnd: posthog.windowEnd }]);
  assert.equal(factory.identity.trace && "link" in factory.identity.trace, false);
  assert.equal(factory.identity.observabilityReferences?.some((reference) => "link" in reference), false);
  assert.equal(fact.metadata?.traceId, "trace-1");
  assert.equal(fact.metadata?.spanId, "span-1");
  assert.deepEqual(findLinks(fact), []);
});

test("PostHog-only facts retain the legacy carrier while technical-only facts stay singular", () => {
  const posthog = { provider: "POSTHOG" as const, metricKey: "attempt-success", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z", link: { label: "metric", url: "https://example.invalid/posthog/only" } };
  const posthogFactory = createResolvedFactFactory({ identity: { ...identity, trace: undefined, observabilityReferences: [posthog] } });
  const posthogFact = posthogFactory.create({ type: "dev.aiprocess.event.attempt.started.v1", logicalKey: "posthog", sequence: 1, data: { attemptId: identity.attemptId } });
  const expectedPostHog = { provider: "POSTHOG", metricKey: "attempt-success", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z" };
  assert.deepEqual(posthogFact.trace, expectedPostHog);
  assert.equal(posthogFact.observabilityReferences, undefined);
  assert.deepEqual(posthogFactory.identity.trace, expectedPostHog);
  assert.equal(posthogFactory.identity.observabilityReferences, undefined);
  const technicalFact = createResolvedFactFactory({ identity }).create({ type: "dev.aiprocess.event.attempt.started.v1", logicalKey: "technical", sequence: 1, data: { attemptId: identity.attemptId } });
  assert.equal(technicalFact.observabilityReferences, undefined);
});

test("fact construction rejects unequal effective references", () => {
  assert.throws(() => createResolvedFactFactory({ identity: { ...identity, observabilityReferences: [{ provider: "LANGSMITH", traceId: "other-trace" }] } }), /conflict/i);
});

test("recursive privacy failures report paths without echoing rejected values", () => {
  const rejected = "recognizable-private-value";
  assert.throws(
    () => assertPrivacySafe({ nested: [{ deeper: { token: rejected } }] }),
    (error: unknown) => error instanceof Error && error.message.includes("$.nested[0].deeper.token") && !error.message.includes(rejected),
  );
});

function findLinks(value: unknown, paths: string[] = [], path = "$"): string[] {
  if (value === null || typeof value !== "object") return paths;
  for (const [key, child] of Object.entries(value)) {
    if (key === "link") paths.push(`${path}.${key}`);
    findLinks(child, paths, `${path}.${key}`);
  }
  return paths;
}
