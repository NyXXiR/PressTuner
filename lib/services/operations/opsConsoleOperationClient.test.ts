import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpsConsoleOperationClient,
  pseudonymizeOperationReference,
} from "./opsConsoleOperationClient";

const operationId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-04T12:00:00.000Z");
const validEnvironment = {
  OPS_CONSOLE_AI_OPERATIONS_URL: "https://ops.example.test",
  OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "write-key-secret",
  OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT: "production",
  OPS_CONSOLE_AI_OPERATIONS_TIMEOUT_MS: "250",
};

test("operation client stays disabled for missing or invalid credentials without requesting", async () => {
  for (const environment of [
    {},
    { ...validEnvironment, OPS_CONSOLE_AI_OPERATIONS_URL: "javascript:alert(1)" },
    { ...validEnvironment, OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: " " },
    { ...validEnvironment, OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key\nheader" },
  ]) {
    let requested = false;
    const client = createOpsConsoleOperationClient({
      environment,
      fetch: async () => {
        requested = true;
        return new Response(null, { status: 201 });
      },
      randomUUID: () => operationId,
      now: () => now,
    });
    const result = await client.begin({
      teamId: "raw-team-id",
      userId: "raw-user-id",
      workflowVersion: "press-agent-v2",
    });
    assert.deepEqual(result, {
      status: "disabled",
      code: "OPS_CONSOLE_DISABLED",
      operationId,
      environment: null,
    });
    assert.equal(requested, false);
  }
});

test("operation client sends strict registration and completion contracts with pseudonyms", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createOpsConsoleOperationClient({
    environment: validEnvironment,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response("{}", { status: requests.length === 1 ? 201 : 200 });
    },
    randomUUID: () => operationId,
    now: () => now,
  });

  const begun = await client.begin({
    teamId: "raw-team-id",
    userId: "raw-user-id",
    workflowVersion: "press-agent-v2",
  });
  assert.deepEqual(begun, {
    status: "registered",
    operationId,
    environment: "production",
  });
  assert.equal(requests[0].url, "https://ops.example.test/api/ai-operations/v1/operations");
  assert.deepEqual(requests[0].init?.headers, {
    authorization: "Bearer write-key-secret",
    "content-type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    schemaVersion: "ops-console/operation-registration/v1",
    operationId,
    workflow: { id: "presstuner.press-agent", version: "press-agent-v2" },
    tenantRef: pseudonymizeOperationReference("raw-team-id"),
    environment: "production",
    actor: {
      type: "human",
      reference: pseudonymizeOperationReference("raw-user-id"),
    },
    startedAt: now.toISOString(),
    registeredAt: now.toISOString(),
  });

  const completedAt = new Date("2026-08-04T12:01:00.000Z");
  const completed = await client.complete({ operationId, completedAt });
  assert.deepEqual(completed, {
    status: "completed",
    operationId,
    environment: "production",
  });
  assert.equal(
    requests[1].url,
    `https://ops.example.test/api/ai-operations/v1/operations/${operationId}/complete`,
  );
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    schemaVersion: "ops-console/operation-completion/v1",
    completedAt: completedAt.toISOString(),
  });
  const serializedRequests = JSON.stringify(requests);
  assert.doesNotMatch(serializedRequests, /raw-team-id|raw-user-id/);
});

test("operation client converts HTTP, network, and timeout failures to safe codes", async () => {
  const cases: Array<{
    fetch: typeof fetch;
    code: string;
  }> = [
    {
      fetch: async () => new Response("private provider body", { status: 503 }),
      code: "OPS_CONSOLE_HTTP_ERROR",
    },
    {
      fetch: async () => {
        throw new Error("raw-team-id raw-user-id private network detail");
      },
      code: "OPS_CONSOLE_NETWORK_ERROR",
    },
    {
      fetch: async () => new Promise<Response>(() => undefined),
      code: "OPS_CONSOLE_TIMEOUT",
    },
  ];

  for (const item of cases) {
    const client = createOpsConsoleOperationClient({
      environment: {
        ...validEnvironment,
        OPS_CONSOLE_AI_OPERATIONS_TIMEOUT_MS: "10",
      },
      fetch: item.fetch,
      randomUUID: () => operationId,
      now: () => now,
    });
    const result = await client.begin({
      teamId: "raw-team-id",
      userId: "raw-user-id",
      workflowVersion: "press-agent-v2",
    });
    assert.equal(result.status, "failed");
    assert.equal(result.code, item.code);
    assert.doesNotMatch(JSON.stringify(result), /raw-team-id|raw-user-id|private/);
  }
});
