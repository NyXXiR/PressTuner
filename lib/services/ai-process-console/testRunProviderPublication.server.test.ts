import assert from "node:assert/strict";
import test from "node:test";
import { projectMetadataForVendor } from "@/domain/ai-process-console/v1/vendorMetadataProjection";
import { createLangSmithOperationTracer, type LangSmithTraceClient } from "@/lib/services/operations/langSmithOperationTracer";
import { createTestRunProviderPublication } from "./testRunProviderPublication.server";

const hmacKey = "provider-correlation-test-hmac-key";
const metadata = {
  projectId: "presstuner", environment: "conformance", serviceName: "presstuner",
  caseId: "case-private", objectType: "synthetic-press-fixture", operationId: "operation-private",
  attemptId: "attempt-private", correlationId: "correlation-private", processId: "press-creation",
  processVersion: "3.0.0", processDefinitionHash: "a".repeat(64), executionMode: "TEST" as const,
};
const input = { metadata, outcome: "SUCCEEDED" as const, startedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z" };

function harness(overrides: { langsmithCreateFails?: boolean; posthogFails?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const updated: Array<{ id: string; run: Record<string, unknown> }> = [];
  const captures: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client: LangSmithTraceClient = {
    async createRun(run) { created.push(run); if (overrides.langsmithCreateFails) throw new Error("provider secret"); },
    async updateRun(id, run) { updated.push({ id, run }); },
    async createFeedback() { return undefined; },
  };
  const environment = {
    LANGSMITH_API_KEY: "ls-secret", LANGSMITH_PROJECT: "test-project",
    AI_PROCESS_CONSOLE_VENDOR_METADATA_HMAC_KEY: hmacKey,
  };
  const langsmith = createLangSmithOperationTracer({
    environment,
    createClient: () => client,
    createDottedOrder: (epoch, id) => `order:${epoch}:${id}`,
  });
  const publication = createTestRunProviderPublication({
    environment,
    langsmith,
    posthog: { apiKey: "phc-secret", apiHost: new URL("https://us.i.posthog.com") },
    fetch: async (url, init) => {
      captures.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (overrides.posthogFails) throw new Error("posthog secret");
      return new Response(null, { status: 200 });
    },
  });
  return { publication, created, updated, captures };
}

test("projects the complete canonical TEST identity equally to LangSmith and PostHog", async () => {
  const { publication, created, updated, captures } = harness();
  await publication.publish(input);
  assert.equal(created.length, 1);
  assert.equal(updated.length, 1);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].url, "https://us.i.posthog.com/capture/");
  const expectedLangSmith = projectMetadataForVendor(metadata, "langsmith", hmacKey);
  const expectedPostHog = projectMetadataForVendor(metadata, "posthog", hmacKey);
  assert.deepEqual((created[0].extra as { metadata: unknown }).metadata, expectedLangSmith);
  const captureProperties = captures[0].body.properties as Record<string, unknown>;
  assert.deepEqual(Object.fromEntries(Object.keys(expectedPostHog).map((key) => [key, captureProperties[key]])), expectedPostHog);
  assert.equal(expectedLangSmith.operation_id, expectedPostHog.operation_id);
  assert.equal(captureProperties.outcome, "accepted");
  assert.equal(captures[0].body.event, "ai_operation_outcome");
  const serialized = JSON.stringify({ created, updated, captures });
  for (const raw of [metadata.operationId, metadata.caseId, metadata.attemptId, metadata.correlationId, metadata.processDefinitionHash]) assert.equal(serialized.includes(raw), false);
});

test("provider failures are independent and exact replay reuses both deduplication identities", async () => {
  const langsmithFailure = harness({ langsmithCreateFails: true });
  await langsmithFailure.publication.publish(input);
  assert.equal(langsmithFailure.captures.length, 1);
  assert.equal(langsmithFailure.updated.length, 1);

  const posthogFailure = harness({ posthogFails: true });
  await posthogFailure.publication.publish(input);
  assert.equal(posthogFailure.created.length, 1);
  assert.equal(posthogFailure.updated.length, 1);

  const replay = harness();
  await replay.publication.publish(input);
  await replay.publication.publish(input);
  assert.equal(replay.created[0].id, replay.created[1].id);
  const first = replay.captures[0].body.properties as Record<string, unknown>;
  const second = replay.captures[1].body.properties as Record<string, unknown>;
  assert.equal(first.$insert_id, second.$insert_id);
  assert.equal(first.operation_id, second.operation_id);
});
