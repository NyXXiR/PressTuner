import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionFactBatchSchema,
  EXECUTION_FACTS_VERSION,
  OPERATION_COMPLETION_VERSION,
  OPERATION_EVENTS_VERSION,
  OPERATION_REGISTRATION_VERSION,
  PRODUCER_CAPABILITIES,
  PRODUCER_CAPABILITIES_VERSION,
  PRODUCER_PROTOCOL_LIMITS,
  PRODUCER_PROTOCOL_VERSION,
  WORKFLOW_MANIFEST_VERSION,
} from "@nyxxir/ops-producer";

import { buildPressAiWorkflowManifest } from "@/domain/press-ai-debugger/opsProducerManifest";
import { mapNodeLifecycle } from "@/domain/ai-telemetry/pressMapper";
import { projectCanonicalEventsToExecutionFactBatches } from "@/domain/ai-telemetry/opsProducerFactProjection";
import { createOpsConsoleOperationClient } from "./opsConsoleOperationClient";

const operationId = "10000000-0000-4000-8000-000000000001";
const traceId = "123e4567e89b12d3a456426614174000";
const environment = {
  OPS_CONSOLE_AI_OPERATIONS_URL: "https://ops.example.test",
  OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key-secret",
  OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT: "production",
};
const capabilities = {
  schemaVersion: PRODUCER_CAPABILITIES_VERSION,
  acceptedProtocolVersions: [PRODUCER_PROTOCOL_VERSION],
  acceptedSchemaVersions: {
    operationRegistration: [OPERATION_REGISTRATION_VERSION],
    operationCompletion: [OPERATION_COMPLETION_VERSION],
    operationEventsBatch: [OPERATION_EVENTS_VERSION],
    workflowManifest: [WORKFLOW_MANIFEST_VERSION],
    executionFactsBatch: [EXECUTION_FACTS_VERSION],
  },
  capabilities: [...PRODUCER_CAPABILITIES],
  limits: PRODUCER_PROTOCOL_LIMITS,
};

test("reference begin negotiates capabilities, registers the manifest, then registers the operation through the package", async () => {
  const workflowManifest = await buildPressAiWorkflowManifest("rag-query");
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const client = createOpsConsoleOperationClient({
    environment,
    randomUUID: () => operationId,
    now: () => new Date("2026-08-09T09:00:00.000Z"),
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if ((init?.method ?? "GET") === "GET") return Response.json(capabilities);
      return Response.json({}, { status: 201 });
    },
  });

  const result = await client.begin({
    teamId: "raw-team-id",
    userId: "raw-user-id",
    workflowVersion: workflowManifest.workflow.version,
    workflowManifest,
    traceId,
  });

  assert.equal(result.status, "registered");
  assert.deepEqual(requests.map(({ url, method }) => ({ url, method })), [
    { url: "https://ops.example.test/api/ai-operations/v1/producer-capabilities", method: "GET" },
    { url: "https://ops.example.test/api/ai-operations/v1/workflows", method: "POST" },
    { url: "https://ops.example.test/api/ai-operations/v1/operations", method: "POST" },
  ]);
  assert.deepEqual((requests[1].body as { definitionHash: string }).definitionHash, workflowManifest.definitionHash);
  assert.deepEqual((requests[2].body as { workflow: unknown }).workflow, workflowManifest.workflow);
  assert.doesNotMatch(JSON.stringify(requests), /raw-team-id|raw-user-id/);
});

test("reference begin fails closed when capability negotiation is invalid", async () => {
  const workflowManifest = await buildPressAiWorkflowManifest("rag-query");
  let requests = 0;
  const client = createOpsConsoleOperationClient({
    environment,
    randomUUID: () => operationId,
    fetch: async () => {
      requests += 1;
      return Response.json({ schemaVersion: "unexpected" });
    },
  });

  const result = await client.begin({
    teamId: "raw-team-id",
    userId: "raw-user-id",
    workflowVersion: workflowManifest.workflow.version,
    workflowManifest,
    traceId,
  });

  assert.deepEqual(result, {
    status: "failed",
    code: "OPS_CONSOLE_CAPABILITY_UNAVAILABLE",
    operationId,
    environment: "production",
  });
  assert.equal(requests, 1);
});

test("reference begin requires every capability declared by the workflow manifest", async () => {
  const workflowManifest = await buildPressAiWorkflowManifest("rag-query");
  for (const omitted of workflowManifest.capabilities) {
    let requests = 0;
    const client = createOpsConsoleOperationClient({
      environment,
      randomUUID: () => operationId,
      fetch: async () => {
        requests += 1;
        return Response.json({
          ...capabilities,
          capabilities: capabilities.capabilities.filter((capability) => capability !== omitted),
        });
      },
    });
    const result = await client.begin({ teamId: "team", userId: "user", workflowVersion: workflowManifest.workflow.version, workflowManifest, traceId });
    assert.equal(result.status, "failed", `must fail closed without ${omitted}`);
    assert.equal("code" in result && result.code, "OPS_CONSOLE_CAPABILITY_UNAVAILABLE");
    assert.equal(requests, 1);
  }
});

test("execution fact delivery delegates strict batches to the shared producer client", async () => {
  const manifest = await buildPressAiWorkflowManifest("rag-query");
  const [batch] = projectCanonicalEventsToExecutionFactBatches({
    operationId,
    manifest,
    events: [mapNodeLifecycle({
      teamId: "team-private",
      runId: "run-private",
      attemptId: "attempt-private",
      processId: "rag-query",
      processVersion: "1.0.0",
      occurredAt: "2026-08-09T10:00:00.000Z",
    }, { nodeId: "request-intake", commandId: "command-private", phase: "COMPLETED" })],
  });
  assert.ok(batch);
  let capturedBody: unknown;
  const client = createOpsConsoleOperationClient({
    environment,
    fetch: async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    },
  });

  const result = await client.appendExecutionFacts({ batch });

  assert.deepEqual(result, { status: "reported", operationId, environment: "production" });
  assert.equal(ExecutionFactBatchSchema.safeParse(capturedBody).success, true);
});

test("reference client reuses the shared capability cache across begin calls", async () => {
  const workflowManifest = await buildPressAiWorkflowManifest("rag-query");
  let capabilityRequests = 0;
  let operationCounter = 0;
  const client = createOpsConsoleOperationClient({
    environment,
    randomUUID: () => `123e4567-e89b-42d3-a456-${String(++operationCounter).padStart(12, "0")}`,
    fetch: async (input, init) => {
      if (String(input).endsWith("/producer-capabilities")) {
        capabilityRequests += 1;
        return Response.json(capabilities);
      }
      return Response.json({}, { status: init?.method === "POST" ? 201 : 200 });
    },
  });

  const first = await client.begin({ teamId: "team", userId: "user", workflowVersion: workflowManifest.workflow.version, workflowManifest, traceId });
  const second = await client.begin({ teamId: "team", userId: "user", workflowVersion: workflowManifest.workflow.version, workflowManifest, traceId });

  assert.equal(first.status, "registered");
  assert.equal(second.status, "registered");
  assert.equal(capabilityRequests, 1);
});
