import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { AI_PROCESS_CONSOLE_SOURCE } from "@/domain/ai-process-console/v1/publication";
import { createResolvedFactFactory } from "@/domain/ai-process-console/v1/factEvents";
import { AiProcessFactConflictError, enqueueAiProcessFact, flushAiProcessFactOutbox } from "./factOutbox";
import { createHttpAiProcessFactTransport } from "./httpFactTransport.server";

const identity = { caseId: "case-outbox", objectType: "synthetic-press-fixture", operationId: "operation-outbox", attemptId: "attempt-outbox", correlationId: "correlation-outbox", testRunId: "test-run-outbox" };
const factory = createResolvedFactFactory({ identity, clock: () => new Date("2030-01-01T00:00:00.000Z") });
const fact = (sequence: number, logicalKey = `fact-${sequence}`) => factory.create({ type: "dev.aiprocess.event.attempt.started.v1", logicalKey, sequence, data: { attemptId: identity.attemptId } });

function assertTestDatabase(): void {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1), /(^|[_-])test($|[_-])/i);
}

test.beforeEach(async () => { assertTestDatabase(); await prisma.aiProcessFactOutbox.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); });
test.after(async () => { await prisma.aiProcessFactOutbox.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }); await prisma.$disconnect(); });

test("fact enqueue is monotonic, idempotent, and transactional", async () => {
  await assert.rejects(prisma.$transaction(async (tx) => { await enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(1) }); throw new Error("ROLLBACK"); }), /ROLLBACK/);
  assert.equal(await prisma.aiProcessFactOutbox.count({ where: { attemptId: identity.attemptId } }), 0);
  const first = await prisma.$transaction((tx) => enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(1) }));
  const replay = await prisma.$transaction((tx) => enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(1) }));
  assert.equal(first.row.id, replay.row.id);
  await assert.rejects(prisma.$transaction((tx) => enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(3) })), AiProcessFactConflictError);
});

test("delivery failure is fail-open, ordered, and permanent errors dead-letter", async () => {
  await prisma.$transaction(async (tx) => { await enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(1) }); await enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(2) }); });
  const delivered: number[] = [];
  await flushAiProcessFactOutbox({ now: new Date("2030-01-02T00:00:00.000Z"), transport: { deliver: async (event) => { delivered.push(event.sequence); return { status: "PERMANENT", code: "CONTRACT_INVALID" }; } } });
  assert.deepEqual(delivered, [1]);
  const rows = await prisma.aiProcessFactOutbox.findMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE, attemptId: identity.attemptId }, orderBy: { sequence: "asc" } });
  assert.equal(rows[0].deliveryState, "DEAD_LETTER");
  assert.equal(rows[1].deliveryState, "PENDING");
  await flushAiProcessFactOutbox({ now: new Date("2030-01-03T00:00:00.000Z"), transport: { deliver: async (event) => { delivered.push(event.sequence); return { status: "DELIVERED" }; } } });
  assert.deepEqual(delivered, [1], "a dead-lettered earlier fact must permanently halt the later stream");
  assert.equal(await prisma.aiProcessProducerDeliveryWatermark.findUnique({ where: { source: AI_PROCESS_CONSOLE_SOURCE } }), null);
});

test("a retryable earlier fact blocks later delivery until its backoff expires and it succeeds", async () => {
  await prisma.$transaction(async (tx) => { await enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(1) }); await enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(2) }); });
  const delivered: number[] = [];
  const firstAttempt = new Date("2030-01-02T00:00:00.000Z");
  await flushAiProcessFactOutbox({ now: firstAttempt, transport: { deliver: async (event) => { delivered.push(event.sequence); return { status: "RETRYABLE", code: "CONSOLE_UNAVAILABLE" }; } } });
  assert.deepEqual(delivered, [1]);
  await flushAiProcessFactOutbox({ now: new Date(firstAttempt.getTime() + 29_999), transport: { deliver: async (event) => { delivered.push(event.sequence); return { status: "DELIVERED" }; } } });
  assert.deepEqual(delivered, [1]);
  await flushAiProcessFactOutbox({ now: new Date(firstAttempt.getTime() + 30_000), transport: { deliver: async (event) => { delivered.push(event.sequence); return { status: "DELIVERED" }; } } });
  assert.deepEqual(delivered, [1, 1, 2]);
});

test("duplicate-delivery success atomically advances the durable source watermark", async () => {
  await prisma.$transaction((tx) => enqueueAiProcessFact(tx, { attemptId: identity.attemptId, event: fact(1) }));
  const deliveredAt = new Date("2030-01-02T00:00:00.000Z");
  const transport = createHttpAiProcessFactTransport({
    destinationUrl: new URL("https://console.example.test/facts"), outboundHmacSecret: "o".repeat(32), timeoutMs: 3000,
    clock: () => deliveredAt,
    fetch: async () => new Response(null, { status: 409, headers: { "X-Ai-Process-Result-Code": "DUPLICATE_EVENT" } }),
  });
  await flushAiProcessFactOutbox({ now: deliveredAt, transport });
  const row = await prisma.aiProcessFactOutbox.findFirstOrThrow({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });
  const watermark = await prisma.aiProcessProducerDeliveryWatermark.findUniqueOrThrow({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });
  assert.equal(row.deliveryState, "DELIVERED");
  assert.equal(watermark.lastSuccessfulDeliveryAt.toISOString(), deliveredAt.toISOString());
});
