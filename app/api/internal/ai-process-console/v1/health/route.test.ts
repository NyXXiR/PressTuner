import assert from "node:assert/strict";
import test from "node:test";
import { signAiProcessRequest } from "@/lib/services/ai-process-console/requestAuthentication";
import type { AiProcessProducerHealth } from "@/lib/services/ai-process-console/producerHealth";
import { createAiProcessConsoleHealthGetHandler } from "@/lib/services/ai-process-console/adapterRoutes.server";

const pathname = "/api/internal/ai-process-console/v1/health";
const clock = () => new Date("2030-01-01T00:05:00.000Z");
const settings = {
  destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const,
  destinationUrl: new URL("https://configured.example.test/facts"),
  inboundHmacSecret: "i".repeat(32), outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 3000,
  authMaxSkewSeconds: 300, flushBatchSize: 50, deliveredRetentionDays: 30, retentionBatchSize: 250, pendingDegradedAfterSeconds: 900,
};
const configuration = { status: "VALID" as const, code: "VALID" as const, settings };

function request(signature?: string, url = `https://app.example.test${pathname}`) {
  const auth = signAiProcessRequest({ secret: settings.inboundHmacSecret, timestamp: "1893456300", method: "GET", pathname, body: "" });
  return new Request(url, { headers: { "x-ai-process-timestamp": auth.timestamp, "x-ai-process-signature": signature ?? auth.signature } });
}

const health = (readiness: "READY" | "DEGRADED" | "NOT_READY"): AiProcessProducerHealth => ({
  schemaVersion: "presstuner-ai-process-producer-health/v1" as const, readiness,
  configuration: { valid: readiness !== "NOT_READY", code: readiness === "NOT_READY" ? "DESTINATION_URL_INVALID" as const : "VALID" as const },
  pendingCount: readiness === "NOT_READY" ? null : 0, deadLetterCount: readiness === "NOT_READY" ? null : 0,
  oldestPendingAgeSeconds: null, lastSuccessfulDeliveryAt: null,
  reasonCodes: readiness === "READY" ? [] : readiness === "DEGRADED" ? ["DEAD_LETTER_PRESENT"] : ["CONFIGURATION_INVALID"],
});

test("health authenticates an exact empty GET body and returns no-store READY", async () => {
  const get = createAiProcessConsoleHealthGetHandler({ loadConfiguration: () => configuration, clock, readHealth: async () => health("READY") });
  const response = await get(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), health("READY"));
});

test("authentication failures are uniform and queries are rejected", async () => {
  const get = createAiProcessConsoleHealthGetHandler({ loadConfiguration: () => configuration, clock, readHealth: async () => health("READY") });
  const rejected = await get(request(`v1=${"0".repeat(64)}`));
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { code: "REQUEST_AUTHENTICATION_FAILED" });
  assert.equal((await get(request(undefined, `https://app.example.test${pathname}?unsafe=1`))).status, 400);
});

test("invalid configuration and non-ready health map to 503", async () => {
  const invalid = createAiProcessConsoleHealthGetHandler({ loadConfiguration: () => ({ status: "INVALID", code: "DESTINATION_URL_INVALID" }) });
  const invalidResponse = await invalid(request());
  assert.equal(invalidResponse.status, 503);
  assert.equal(invalidResponse.headers.get("cache-control"), "no-store");
  const degraded = createAiProcessConsoleHealthGetHandler({ loadConfiguration: () => configuration, clock, readHealth: async () => health("DEGRADED") });
  assert.equal((await degraded(request())).status, 503);
});

test("health response defines no CONNECTED producer state", async () => {
  const get = createAiProcessConsoleHealthGetHandler({ loadConfiguration: () => configuration, clock, readHealth: async () => health("READY") });
  assert.equal(JSON.stringify(await (await get(request())).json()).includes("CONNECTED"), false);
});
