import assert from "node:assert/strict";
import test from "node:test";
import { signAiProcessRequest } from "@/lib/services/ai-process-console/requestAuthentication";
import { createProjectTestDebugPostHandler, PROJECT_TEST_DEBUG_REPLAY_PATH } from "@/lib/services/ai-process-console/projectTestDebugRoutes.server";

const secret = "s".repeat(32);
const configuration = () => ({ status: "VALID" as const, code: "VALID" as const, settings: { destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const, destinationUrl: new URL("https://console.example"), inboundHmacSecret: secret, outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 1_000, authMaxSkewSeconds: 300, flushBatchSize: 1, deliveredRetentionDays: 30, retentionBatchSize: 1, pendingDegradedAfterSeconds: 900 } });

test("v2 replay route rejects timestamp skew before replay service invocation", async () => {
  const now = () => new Date("2030-01-01T00:10:00.000Z");
  const body = JSON.stringify({ exact: true });
  const timestamp = String(Math.floor(new Date("2030-01-01T00:00:00.000Z").getTime() / 1_000));
  const signature = signAiProcessRequest({ secret, timestamp, method: "POST", pathname: PROJECT_TEST_DEBUG_REPLAY_PATH, body });
  let called = false;
  const post = createProjectTestDebugPostHandler(PROJECT_TEST_DEBUG_REPLAY_PATH, { loadConfiguration: configuration, clock: now, replay: async () => { called = true; return { schemaVersion: "2.0", requestId: "invalid-request", status: "REJECTED", replayOfAttemptId: "invalid-attempt", reasonCode: "REQUEST_INVALID" }; } });
  const response = await post(new Request(`https://app.example${PROJECT_TEST_DEBUG_REPLAY_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-ai-process-timestamp": signature.timestamp, "x-ai-process-signature": signature.signature }, body }));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});
