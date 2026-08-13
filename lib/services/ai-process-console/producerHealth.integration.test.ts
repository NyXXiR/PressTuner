import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AI_PROCESS_CONSOLE_SOURCE } from "@/domain/ai-process-console/v1/publication";
import { classifyAiProcessProducerHealth, readAiProcessProducerHealth } from "./producerHealth";

const settings = {
  destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const, destinationUrl: new URL("https://console.example.test/facts"),
  inboundHmacSecret: "i".repeat(32), outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 3000, authMaxSkewSeconds: 300,
  flushBatchSize: 50, deliveredRetentionDays: 30, retentionBatchSize: 250, pendingDegradedAfterSeconds: 900,
};
const configuration = { status: "VALID" as const, code: "VALID" as const, settings };

function assertTestDatabase() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1), /(^|[_-])test($|[_-])/i);
}

async function row(state: "PENDING" | "DELIVERED" | "DEAD_LETTER", createdAt: Date, deliveredAt: Date | null = null) {
  const id = randomUUID();
  return prisma.aiProcessFactOutbox.create({ data: { source: AI_PROCESS_CONSOLE_SOURCE, eventId: `event-${id}`, attemptId: `attempt-${id}`, sequence: 1, eventType: "dev.aiprocess.event.attempt.started.v1", canonicalHash: "0".repeat(64), payload: {}, deliveryState: state, createdAt, deliveredAt } });
}

test.beforeEach(async () => { assertTestDatabase(); await prisma.aiProcessFactOutbox.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); });
test.after(async () => { await prisma.aiProcessFactOutbox.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.$disconnect(); });

test("health reports counts, oldest pending age, dead letters, and the delivery watermark", async () => {
  const now = new Date("2030-02-01T00:00:00.000Z");
  await row("PENDING", new Date(now.getTime() - 901_000));
  await row("PENDING", new Date(now.getTime() - 30_000));
  await row("DEAD_LETTER", new Date(now.getTime() - 10_000));
  const deliveredAt = new Date(now.getTime() - 5_000);
  await prisma.aiProcessProducerDeliveryWatermark.create({ data: { source: AI_PROCESS_CONSOLE_SOURCE, lastSuccessfulDeliveryAt: deliveredAt } });
  const health = await readAiProcessProducerHealth({ configuration, now });
  assert.deepEqual(health, {
    schemaVersion: "presstuner-ai-process-producer-health/v1", readiness: "DEGRADED", configuration: { valid: true, code: "VALID" },
    pendingCount: 2, deadLetterCount: 1, oldestPendingAgeSeconds: 901, lastSuccessfulDeliveryAt: deliveredAt.toISOString(),
    reasonCodes: ["DEAD_LETTER_PRESENT", "PENDING_BACKLOG_STALE"],
  });
});

test("young or empty pending evidence stays READY without implying connectivity", async () => {
  const now = new Date("2030-02-01T00:00:00.000Z");
  await row("PENDING", new Date(now.getTime() - 900_000));
  assert.equal((await readAiProcessProducerHealth({ configuration, now })).readiness, "READY", "threshold is exceeded, not equaled");
  await prisma.aiProcessFactOutbox.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });
  const empty = await readAiProcessProducerHealth({ configuration, now });
  assert.equal(empty.readiness, "READY");
  assert.equal(empty.lastSuccessfulDeliveryAt, null);
  assert.equal(JSON.stringify(empty).includes("CONNECTED"), false);
});

test("disabled, invalid, and database query failures are deterministically NOT_READY", async () => {
  assert.deepEqual(classifyAiProcessProducerHealth({ configuration: { status: "DISABLED", code: "DISABLED" } }).reasonCodes, ["ADAPTER_DISABLED"]);
  assert.deepEqual(classifyAiProcessProducerHealth({ configuration: { status: "INVALID", code: "DESTINATION_URL_INVALID" } }).reasonCodes, ["CONFIGURATION_INVALID"]);
  const database = { aiProcessFactOutbox: { count: async () => { throw new Error("private query detail"); }, findFirst: async () => null }, aiProcessProducerDeliveryWatermark: { findUnique: async () => null } };
  const failed = await readAiProcessProducerHealth({ configuration, database });
  assert.equal(failed.readiness, "NOT_READY");
  assert.deepEqual(failed.reasonCodes, ["HEALTH_QUERY_FAILED"]);
  assert.equal(failed.pendingCount, null);
});
