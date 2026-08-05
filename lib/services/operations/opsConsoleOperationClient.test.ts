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

function guardrailClient(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  return createOpsConsoleOperationClient({
    environment: validEnvironment,
    fetch: fetchImpl as never,
    now: () => now,
    randomUUID: (() => {
      let counter = 0;
      return () => `20000000-0000-4000-8000-${String((counter += 1)).padStart(12, "0")}`;
    })(),
  });
}

test("guardrail verdicts are pushed as one batch of attributed quality signals", async () => {
  let captured: Record<string, unknown> | null = null;
  let capturedUrl = "";
  const client = guardrailClient(async (url, init) => {
    capturedUrl = url;
    captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(null, { status: 202 });
  });

  const result = await client.reportGuardrails({
    operationId,
    verdicts: [
      { stageId: "verification", guardrailId: "citation-claim-verification", verdict: "violation" },
      { stageId: "fallback", guardrailId: "safe-fallback", verdict: "pass" },
    ],
  });

  assert.equal(result.status, "reported");
  assert.equal(capturedUrl, "https://ops.example.test/api/ai-operations/v1/events");
  const body = captured as unknown as { schemaVersion: string; events: Array<Record<string, unknown>> };
  assert.equal(body.schemaVersion, "ops-console/operation-events-batch/v1");
  assert.equal(body.events.length, 2);

  const [violation, pass] = body.events;
  assert.equal(violation!.providerId, "opentelemetry");
  assert.equal(violation!.operationId, operationId);
  assert.equal(violation!.providerRecordId, "guardrail:verification:citation-claim-verification");
  assert.deepEqual(violation!.signal, {
    kind: "quality", metricId: "guardrail_verdict", value: 1, unit: "violations",
    sampleCount: 1, direction: "lower_is_better",
    stageId: "verification", guardrailId: "citation-claim-verification", verdict: "violation",
  });
  // A pass still reports, carrying zero so the grid can show a clean cell.
  assert.equal((pass!.signal as { value: number }).value, 0);
  // Every event needs its own ID; a repeated ID would be treated as a duplicate.
  assert.notEqual(violation!.eventId, pass!.eventId);
});

test("guardrail reporting stays silent when there is nothing to report or no credentials", async () => {
  let requested = false;
  const client = guardrailClient(async () => { requested = true; return new Response(null, { status: 202 }); });

  assert.equal((await client.reportGuardrails({ operationId, verdicts: [] })).status, "reported");
  assert.equal(requested, false);

  const disabledClient = createOpsConsoleOperationClient({
    environment: {},
    fetch: (async () => { requested = true; return new Response(null); }) as never,
  });
  assert.equal((await disabledClient.reportGuardrails({ operationId, verdicts: [{ stageId: "fallback", guardrailId: "safe-fallback", verdict: "pass" }] })).status, "disabled");
  assert.equal(requested, false);
});

test("guardrail reporting rejects a malformed operation ID and never reports a transport failure as success", async () => {
  const client = guardrailClient(async () => new Response(null, { status: 500 }));
  const verdicts = [{ stageId: "verification", guardrailId: "citation-claim-verification", verdict: "violation" }] as const;

  const invalid = await client.reportGuardrails({ operationId: "not-a-uuid", verdicts });
  assert.equal(invalid.status, "failed");
  assert.equal("code" in invalid && invalid.code, "OPS_CONSOLE_INVALID_OPERATION_ID");

  const serverError = await client.reportGuardrails({ operationId, verdicts });
  assert.equal(serverError.status, "failed");
  assert.equal("code" in serverError && serverError.code, "OPS_CONSOLE_HTTP_ERROR");
});
