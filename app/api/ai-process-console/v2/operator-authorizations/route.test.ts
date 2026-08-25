import assert from "node:assert/strict";
import test from "node:test";
import { signAiProcessRequest } from "@/lib/services/ai-process-console/requestAuthentication";
import { createProjectTestDebugPostHandler, PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH } from "@/lib/services/ai-process-console/projectTestDebugRoutes.server";

const secret = "s".repeat(32);
const now = () => new Date("2030-01-01T00:00:00.000Z");
const validConfiguration = () => ({ status: "VALID" as const, code: "VALID" as const, settings: { destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const, destinationUrl: new URL("https://console.example"), inboundHmacSecret: secret, outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 1_000, authMaxSkewSeconds: 300, flushBatchSize: 1, deliveredRetentionDays: 30, retentionBatchSize: 1, pendingDegradedAfterSeconds: 900 } });

const signedRequest = (body: string, headers: Record<string, string> = {}) => {
  const timestamp = String(Math.floor(now().getTime() / 1_000));
  const signed = signAiProcessRequest({ secret, timestamp, method: "POST", pathname: PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH, body });
  return new Request(`https://app.example${PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-ai-process-timestamp": signed.timestamp, "x-ai-process-signature": signed.signature, ...headers }, body });
};

test("operator authorization route verifies exact raw-body HMAC before parsing", async () => {
  let called = 0;
  const post = createProjectTestDebugPostHandler(PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH, { loadConfiguration: validConfiguration, clock: now, authorize: async () => { called += 1; return { schemaVersion: "2.0", authorized: false }; } });
  const bad = await post(new Request(`https://app.example${PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
  assert.equal(bad.status, 401);
  assert.equal(called, 0);
  const good = await post(signedRequest(JSON.stringify({ schemaVersion: "2.0", sessionCredential: "opaque-sid", projectId: "presstuner", environment: "conformance" }), { "x-user": "spoofed", "x-forwarded-user": "spoofed" }));
  assert.equal(good.status, 200);
  assert.equal(called, 1);
});

test("operator authorization route rejects oversized bodies before service invocation", async () => {
  let called = 0;
  const post = createProjectTestDebugPostHandler(PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH, { loadConfiguration: validConfiguration, authorize: async () => { called += 1; return { schemaVersion: "2.0", authorized: false }; } });
  const response = await post(signedRequest(JSON.stringify({ value: "x".repeat(70_000) })));
  assert.equal(response.status, 413);
  assert.equal(called, 0);
});
