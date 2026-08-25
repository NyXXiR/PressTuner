import assert from "node:assert/strict";
import test from "node:test";
import { fixtureRegistry } from "@/domain/ai-process-console/v1/fixtureRegistry";
import { buildProjectManifest, processDefinitionReference, buildProcessDefinition } from "@/domain/ai-process-console/v1/publication";
import { classifyTestRunRequest } from "./testRunService";
import { fixtureRegistryV2 } from "@/domain/ai-process-console/v2/fixtureRegistry";
import { buildProcessDefinitionV2, buildProcessDefinitionV2Compatibility } from "@/domain/ai-process-console/v2/publication";

const command = () => ({ specversion: "1.0", id: "command-123", source: "urn:ai-process-console:test-runs", subject: "project/presstuner", time: "2030-01-01T00:00:00.000Z", schemaVersion: "1.0", correlationId: "correlation-123", sequence: 0, executionMode: "TEST", type: "dev.aiprocess.command.test-run.requested.v1", data: { testRunId: "test-run-123", projectId: buildProjectManifest().projectId, processDefinition: processDefinitionReference(buildProcessDefinition()), fixture: fixtureRegistry[0].artifact } });

test("only the strict fixture-isolated test-run command is accepted", () => {
  assert.equal(classifyTestRunRequest(command()).accepted, true);
  assert.deepEqual(classifyTestRunRequest({ ...command(), type: "dev.aiprocess.command.node-execution.requested.v1" }), { accepted: false, code: "REQUEST_INVALID" });
  assert.deepEqual(classifyTestRunRequest({ ...command(), extra: true }), { accepted: false, code: "REQUEST_INVALID" });
  for (const [key, value] of Object.entries({ destinationId: "caller", destinationUrl: "https://attacker.invalid", handler: "override", node: "draft", transition: "force", fixtureText: "private", mutation: "production" })) {
    assert.deepEqual(classifyTestRunRequest({ ...command(), [key]: value }), { accepted: false, code: "REQUEST_INVALID" }, key);
  }
});

test("the same isolated endpoint accepts the exact v2 definition and fixture only", () => {
  const success = fixtureRegistryV2.find(({ fixture }) => fixture.fixtureId === "success-v2")!;
  const input = { ...command(), data: { ...command().data, processDefinition: processDefinitionReference(buildProcessDefinitionV2()), fixture: success.artifact } };
  assert.deepEqual(classifyTestRunRequest(input), { accepted: true, command: input, fixture: success.fixture, contractVersion: "v2", definition: buildProcessDefinitionV2() });
  assert.deepEqual(classifyTestRunRequest({ ...input, data: { ...input.data, fixture: fixtureRegistry[0].artifact } }), { accepted: false, code: "FIXTURE_NOT_FOUND" });
});

test("every registered v2 fixture requires its exact immutable declaration", () => {
  for (const entry of fixtureRegistryV2) {
    const definition = entry.fixture.processVersion === "3.1.0" ? buildProcessDefinitionV2Compatibility() : buildProcessDefinitionV2();
    const input = { ...command(), data: { ...command().data, processDefinition: processDefinitionReference(definition), fixture: entry.artifact } };
    assert.deepEqual(classifyTestRunRequest(input), { accepted: true, command: input, fixture: entry.fixture, contractVersion: "v2", definition });
    for (const fixture of [
      { ...entry.artifact, artifactId: `${entry.artifact.artifactId}-changed` },
      { ...entry.artifact, locator: `${entry.artifact.locator}-changed` },
      { ...entry.artifact, sizeBytes: entry.artifact.sizeBytes + 1 },
      { ...entry.artifact, sha256: "0".repeat(64) },
    ]) assert.deepEqual(classifyTestRunRequest({ ...input, data: { ...input.data, fixture } }), { accepted: false, code: "FIXTURE_NOT_FOUND" });
  }
});

test("definition, project, unknown fixture, and saved-case requests are rejected safely", () => {
  assert.deepEqual(classifyTestRunRequest({ ...command(), data: { ...command().data, projectId: "other" } }), { accepted: false, code: "REQUEST_INVALID" });
  assert.deepEqual(classifyTestRunRequest({ ...command(), data: { ...command().data, processDefinition: { ...command().data.processDefinition, sha256: "0".repeat(64) } } }), { accepted: false, code: "DEFINITION_NOT_FOUND" });
  assert.deepEqual(classifyTestRunRequest({ ...command(), data: { ...command().data, fixture: { ...command().data.fixture, sha256: "0".repeat(64) } } }), { accepted: false, code: "FIXTURE_NOT_FOUND" });
  assert.deepEqual(classifyTestRunRequest({ ...command(), data: { ...command().data, fixture: { ...command().data.fixture, locator: "ref:saved-cases/unsafe" } } }), { accepted: false, code: "ISOLATION_UNAVAILABLE" });
});

test("technical, PostHog, and combined command carriers are accepted", () => {
  const technical = { provider: "LANGSMITH" as const, traceId: "trace-1", spanId: "span-1" };
  const posthog = { provider: "POSTHOG" as const, metricKey: "test-run", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z" };
  assert.equal(classifyTestRunRequest({ ...command(), trace: technical }).accepted, true);
  assert.equal(classifyTestRunRequest({ ...command(), trace: posthog }).accepted, true);
  assert.equal(classifyTestRunRequest({ ...command(), trace: technical, observabilityReferences: [posthog] }).accepted, true);
});

test("invalid or conflicting observability carriers are REQUEST_INVALID", () => {
  const technical = { provider: "LANGSMITH" as const, traceId: "trace-1" };
  const posthog = { provider: "POSTHOG" as const, metricKey: "test-run", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z" };
  for (const input of [
    { ...command(), trace: technical, observabilityReferences: [{ ...technical, traceId: "trace-2" }] },
    { ...command(), trace: technical, observabilityReferences: [{ provider: "OPENTELEMETRY" as const, traceId: "trace-1" }] },
    { ...command(), trace: posthog, observabilityReferences: [{ ...posthog, metricKey: "other-metric" }] },
    { ...command(), trace: { ...posthog, windowEnd: posthog.windowStart } },
    { ...command(), observabilityReferences: [{ ...posthog, windowEnd: "2029-12-31T23:59:59.999Z" }] },
  ]) assert.deepEqual(classifyTestRunRequest(input), { accepted: false, code: "REQUEST_INVALID" });
});
