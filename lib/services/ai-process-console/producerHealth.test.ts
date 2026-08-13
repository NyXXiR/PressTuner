import assert from "node:assert/strict";
import test from "node:test";
import { classifyAiProcessProducerHealth, readAiProcessProducerHealth } from "./producerHealth";

const settings = {
  destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const, destinationUrl: new URL("https://console.example.test/facts"),
  inboundHmacSecret: "i".repeat(32), outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 3000, authMaxSkewSeconds: 300,
  flushBatchSize: 50, deliveredRetentionDays: 30, retentionBatchSize: 250, pendingDegradedAfterSeconds: 900,
};
const configuration = { status: "VALID" as const, code: "VALID" as const, settings };

test("readiness classification is deterministic at and beyond the pending threshold", () => {
  const now = new Date("2030-01-01T00:15:00.000Z");
  const atThreshold = classifyAiProcessProducerHealth({ configuration, now, evidence: { pendingCount: 1, deadLetterCount: 0, oldestPendingCreatedAt: new Date("2030-01-01T00:00:00.000Z"), lastSuccessfulDeliveryAt: null } });
  assert.equal(atThreshold.readiness, "READY");
  const staleAndDead = classifyAiProcessProducerHealth({ configuration, now: new Date(now.getTime() + 1000), evidence: { pendingCount: 1, deadLetterCount: 1, oldestPendingCreatedAt: new Date("2030-01-01T00:00:00.000Z"), lastSuccessfulDeliveryAt: new Date("2030-01-01T00:10:00.000Z") } });
  assert.equal(staleAndDead.readiness, "DEGRADED");
  assert.deepEqual(staleAndDead.reasonCodes, ["DEAD_LETTER_PRESENT", "PENDING_BACKLOG_STALE"]);
  assert.equal(staleAndDead.lastSuccessfulDeliveryAt, "2030-01-01T00:10:00.000Z");
});

test("database failures return bounded NOT_READY evidence", async () => {
  const database = { aiProcessFactOutbox: { count: async () => { throw new Error("credential-bearing detail"); }, findFirst: async () => null }, aiProcessProducerDeliveryWatermark: { findUnique: async () => null } };
  const result = await readAiProcessProducerHealth({ configuration, database });
  assert.equal(result.readiness, "NOT_READY");
  assert.deepEqual(result.reasonCodes, ["HEALTH_QUERY_FAILED"]);
  assert.equal(JSON.stringify(result).includes("credential"), false);
});
