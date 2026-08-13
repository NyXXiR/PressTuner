import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AI_PROCESS_CONSOLE_SOURCE } from "@/domain/ai-process-console/v1/publication";
import { retainDeliveredAiProcessFacts } from "./deliveredFactRetention";

const OTHER_SOURCE = "urn:other:ai-process-console:facts:v1";
const now = new Date("2030-03-31T00:00:00.000Z");
const cutoff = new Date(now.getTime() - 30 * 86_400_000);

function assertTestDatabase() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1), /(^|[_-])test($|[_-])/i);
}

async function row(source: string, state: "PENDING" | "DELIVERED" | "DEAD_LETTER", deliveredAt: Date | null) {
  const id = randomUUID();
  return prisma.aiProcessFactOutbox.create({ data: { source, eventId: `event-${id}`, attemptId: `attempt-${id}`, sequence: 1, eventType: "dev.aiprocess.event.attempt.started.v1", canonicalHash: "0".repeat(64), payload: {}, deliveryState: state, deliveredAt, createdAt: new Date("2029-01-01T00:00:00.000Z") } });
}

test.beforeEach(async () => { assertTestDatabase(); await prisma.aiProcessFactOutbox.deleteMany({ where: { source: { in: [AI_PROCESS_CONSOLE_SOURCE, OTHER_SOURCE] } } }); await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); });
test.after(async () => { await prisma.aiProcessFactOutbox.deleteMany({ where: { source: { in: [AI_PROCESS_CONSOLE_SOURCE, OTHER_SOURCE] } } }); await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.$disconnect(); });

test("retention uses a strict cutoff and excludes other sources and delivery states", async () => {
  const eligible = await row(AI_PROCESS_CONSOLE_SOURCE, "DELIVERED", new Date(cutoff.getTime() - 1));
  const exact = await row(AI_PROCESS_CONSOLE_SOURCE, "DELIVERED", cutoff);
  const pending = await row(AI_PROCESS_CONSOLE_SOURCE, "PENDING", new Date(cutoff.getTime() - 1));
  const dead = await row(AI_PROCESS_CONSOLE_SOURCE, "DEAD_LETTER", new Date(cutoff.getTime() - 1));
  const other = await row(OTHER_SOURCE, "DELIVERED", new Date(cutoff.getTime() - 1));
  const watermarkAt = new Date("2030-03-30T00:00:00.000Z");
  await prisma.aiProcessProducerDeliveryWatermark.create({ data: { source: AI_PROCESS_CONSOLE_SOURCE, lastSuccessfulDeliveryAt: watermarkAt } });
  assert.deepEqual(await retainDeliveredAiProcessFacts({ retentionDays: 30, batchSize: 100, now }), { selectedCount: 1, deletedCount: 1 });
  assert.equal(await prisma.aiProcessFactOutbox.findUnique({ where: { id: eligible.id } }), null);
  for (const retained of [exact, pending, dead, other]) assert.notEqual(await prisma.aiProcessFactOutbox.findUnique({ where: { id: retained.id } }), null);
  assert.equal((await prisma.aiProcessProducerDeliveryWatermark.findUniqueOrThrow({ where: { source: AI_PROCESS_CONSOLE_SOURCE } })).lastSuccessfulDeliveryAt.toISOString(), watermarkAt.toISOString());
});

test("retention is bounded and enforces its minimum window and batch cap", async () => {
  await row(AI_PROCESS_CONSOLE_SOURCE, "DELIVERED", new Date(cutoff.getTime() - 2));
  await row(AI_PROCESS_CONSOLE_SOURCE, "DELIVERED", new Date(cutoff.getTime() - 1));
  assert.deepEqual(await retainDeliveredAiProcessFacts({ retentionDays: 30, batchSize: 1, now }), { selectedCount: 1, deletedCount: 1 });
  assert.equal(await prisma.aiProcessFactOutbox.count({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }), 1);
  await assert.rejects(retainDeliveredAiProcessFacts({ retentionDays: 6, batchSize: 1, now }), /RETENTION_DAYS_INVALID/);
  await assert.rejects(retainDeliveredAiProcessFacts({ retentionDays: 30, batchSize: 1001, now }), /RETENTION_BATCH_INVALID/);
});
