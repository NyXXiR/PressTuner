import assert from "node:assert/strict";
import test from "node:test";
import { runAiProcessConsoleProducerWorker } from "./producerWorker";

const settings = {
  destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const,
  destinationUrl: new URL("https://console.example.test/facts"),
  inboundHmacSecret: "i".repeat(32), outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 3000,
  authMaxSkewSeconds: 300, flushBatchSize: 50, deliveredRetentionDays: 30, retentionBatchSize: 250, pendingDegradedAfterSeconds: 900,
};

test("worker runs configuration, flush, retention, and health in exact order", async () => {
  const calls: string[] = [];
  const result = await runAiProcessConsoleProducerWorker({
    loadConfiguration: () => { calls.push("configuration"); return { status: "VALID", code: "VALID", settings }; },
    createTransport: () => ({ deliver: async () => ({ status: "DELIVERED" }) }),
    flush: async () => { calls.push("flush"); },
    retain: async () => { calls.push("retention"); return { selectedCount: 2, deletedCount: 2 }; },
    readHealth: async () => { calls.push("health"); return { schemaVersion: "presstuner-ai-process-producer-health/v1", readiness: "READY", configuration: { valid: true, code: "VALID" }, pendingCount: 0, deadLetterCount: 0, oldestPendingAgeSeconds: null, lastSuccessfulDeliveryAt: null, reasonCodes: [] }; },
  });
  assert.deepEqual(calls, ["configuration", "flush", "retention", "health"]);
  assert.equal(result.exitCode, 0);
});

test("only enabled invalid configuration exits nonzero", async () => {
  const disabled = await runAiProcessConsoleProducerWorker({ loadConfiguration: () => ({ status: "DISABLED", code: "DISABLED" }) });
  const invalid = await runAiProcessConsoleProducerWorker({ loadConfiguration: () => ({ status: "INVALID", code: "DESTINATION_URL_INVALID" }) });
  assert.equal(disabled.exitCode, 0);
  assert.equal(invalid.exitCode, 1);
});

test("delivery, retention, and health failures remain safe exit-zero evidence", async () => {
  const result = await runAiProcessConsoleProducerWorker({
    loadConfiguration: () => ({ status: "VALID", code: "VALID", settings }),
    createTransport: () => ({ deliver: async () => ({ status: "DELIVERED" }) }),
    flush: async () => { throw new Error("database URL secret"); },
    retain: async () => { throw new Error("payload detail"); },
    readHealth: async () => { throw new Error("query detail"); },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("payload"), false);
});
