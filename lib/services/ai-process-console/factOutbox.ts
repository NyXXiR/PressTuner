import { Prisma } from "@prisma/client";
import { EventV1Schema, assertPrivacySafe, type EventV1 } from "@/domain/ai-process-console/v1/contracts";
import { canonicalFactContent } from "@/domain/ai-process-console/v1/factEvents";
import { sha256Text } from "@/domain/ai-process-console/v1/canonicalJson";
import { prisma } from "@/lib/prisma";
import { AI_PROCESS_FACT_MAX_ATTEMPTS, factRetryDelayMs, normalizeFactDeliveryError, type AiProcessFactTransport, type FactDeliveryResult } from "./factTransport";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class AiProcessFactConflictError extends Error {
  constructor(message: "AI_PROCESS_FACT_CONTENT_CONFLICT" | "AI_PROCESS_FACT_SEQUENCE_CONFLICT") {
    super(message);
    this.name = "AiProcessFactConflictError";
  }
}

export async function enqueueAiProcessFact(tx: Prisma.TransactionClient, input: { attemptId: string; event: EventV1 }) {
  const event = EventV1Schema.parse(input.event);
  assertPrivacySafe(event);
  if (event.source.length === 0 || input.attemptId.length === 0) throw new Error("AI_PROCESS_FACT_IDENTITY_INVALID");
  const canonical = canonicalFactContent(event);
  const canonicalHash = sha256Text(canonical);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${event.source}:${input.attemptId}`}))`;
  const duplicate = await tx.aiProcessFactOutbox.findUnique({ where: { source_eventId: { source: event.source, eventId: event.id } } });
  if (duplicate) {
    if (duplicate.canonicalHash !== canonicalHash) throw new AiProcessFactConflictError("AI_PROCESS_FACT_CONTENT_CONFLICT");
    return { row: duplicate, created: false };
  }
  const latest = await tx.aiProcessFactOutbox.findFirst({ where: { source: event.source, attemptId: input.attemptId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  if (event.sequence !== (latest?.sequence ?? 0) + 1) throw new AiProcessFactConflictError("AI_PROCESS_FACT_SEQUENCE_CONFLICT");
  const row = await tx.aiProcessFactOutbox.create({ data: { source: event.source, eventId: event.id, attemptId: input.attemptId, sequence: event.sequence, eventType: event.type, canonicalHash, payload: json(event) } });
  return { row, created: true };
}

export async function enqueueNextAiProcessFact(tx: Prisma.TransactionClient, input: { source: string; attemptId: string; build: (sequence: number) => EventV1 }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.source}:${input.attemptId}`}))`;
  const latest = await tx.aiProcessFactOutbox.findFirst({ where: { source: input.source, attemptId: input.attemptId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const event = EventV1Schema.parse(input.build((latest?.sequence ?? 0) + 1));
  if (event.source !== input.source) throw new Error("AI_PROCESS_FACT_SOURCE_MISMATCH");
  // The lock is re-entrant for this transaction; the shared validator owns final idempotence checks.
  return enqueueAiProcessFact(tx, { attemptId: input.attemptId, event });
}

async function applyDeliveryResult(row: { id: string; source: string; attemptCount: number }, result: FactDeliveryResult, now: Date) {
  const attemptCount = row.attemptCount + 1;
  if (result.status === "DELIVERED") {
    await prisma.$transaction(async (tx) => {
      await tx.aiProcessFactOutbox.update({ where: { id: row.id }, data: { deliveryState: "DELIVERED", attemptCount, deliveredAt: now, nextAttemptAt: null, safeErrorCode: null } });
      await tx.$executeRaw`
        INSERT INTO "ai_process_producer_delivery_watermark" ("source", "last_successful_delivery_at")
        VALUES (${row.source}, ${now})
        ON CONFLICT ("source") DO UPDATE SET
          "last_successful_delivery_at" = GREATEST(
            "ai_process_producer_delivery_watermark"."last_successful_delivery_at",
            EXCLUDED."last_successful_delivery_at"
          )
      `;
    });
    return true;
  }
  const dead = result.status === "PERMANENT" || attemptCount >= AI_PROCESS_FACT_MAX_ATTEMPTS;
  await prisma.aiProcessFactOutbox.update({ where: { id: row.id }, data: { deliveryState: dead ? "DEAD_LETTER" : "PENDING", attemptCount, safeErrorCode: result.code.slice(0, 100), nextAttemptAt: dead ? null : new Date(now.getTime() + factRetryDelayMs(attemptCount)) } });
  return false;
}

export async function flushAiProcessFactOutbox(args: { transport?: AiProcessFactTransport; now?: Date; limit?: number } = {}): Promise<void> {
  if (!args.transport) return;
  try {
    const now = args.now ?? new Date();
    const rows = await prisma.aiProcessFactOutbox.findMany({ where: { deliveryState: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: [{ createdAt: "asc" }, { sequence: "asc" }], take: args.limit ?? 50 });
    const haltedAttempts = new Set<string>();
    for (const row of rows) {
      const stream = `${row.source}\u0000${row.attemptId}`;
      if (haltedAttempts.has(stream)) continue;
      const earlier = await prisma.aiProcessFactOutbox.findFirst({ where: { source: row.source, attemptId: row.attemptId, sequence: { lt: row.sequence }, deliveryState: { in: ["PENDING", "DEAD_LETTER"] } }, select: { id: true } });
      if (earlier) { haltedAttempts.add(stream); continue; }
      const parsed = EventV1Schema.safeParse(row.payload);
      let result: FactDeliveryResult;
      if (!parsed.success) result = { status: "PERMANENT", code: "CONTRACT_INVALID" };
      else {
        try { result = await args.transport.deliver(parsed.data); }
        catch (error) { result = normalizeFactDeliveryError(error); }
      }
      const delivered = await applyDeliveryResult(row, result, now);
      if (!delivered) haltedAttempts.add(stream);
    }
  } catch {
    // Fail-open: test-run and debugger state are authoritative after commit.
  }
}
