import { Prisma } from "@prisma/client";
import { parseCanonicalAiTelemetryEvent, type CanonicalAiTelemetryEvent } from "@/domain/ai-telemetry/contracts";
import { prisma } from "@/lib/prisma";

export const CANONICAL_AI_TELEMETRY_EVENT_TYPE = "CANONICAL_AI_TELEMETRY_V1";
type StoreClient = Prisma.TransactionClient;

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function appendCanonicalEvent(client: StoreClient, input: CanonicalAiTelemetryEvent): Promise<CanonicalAiTelemetryEvent> {
  const proposed = parseCanonicalAiTelemetryEvent(input);
  const existing = await client.agentRuntimeAuditEvent.findUnique({ where: { canonicalEventId: proposed.eventId }, select: { details: true } });
  if (existing) return parseCanonicalAiTelemetryEvent(existing.details);

  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${proposed.scope.teamId}:${proposed.traceId}`}))`;
  const duplicate = await client.agentRuntimeAuditEvent.findUnique({ where: { canonicalEventId: proposed.eventId }, select: { details: true } });
  if (duplicate) return parseCanonicalAiTelemetryEvent(duplicate.details);
  const latest = await client.agentRuntimeAuditEvent.findFirst({ where: { teamId: proposed.scope.teamId, traceId: proposed.traceId, sequence: { not: null } }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const event = parseCanonicalAiTelemetryEvent({ ...proposed, sequence: (latest?.sequence ?? 0) + 1 });
  try {
    await client.agentRuntimeAuditEvent.create({ data: { teamId: event.scope.teamId, runId: event.scope.runId, eventType: CANONICAL_AI_TELEMETRY_EVENT_TYPE, occurredAt: new Date(event.occurredAt), details: json(event), schemaVersion: event.schemaVersion, canonicalEventId: event.eventId, traceId: event.traceId, spanId: event.spanId, parentSpanId: event.parentSpanId, sequence: event.sequence, eventKind: event.eventKind } });
    return event;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await client.agentRuntimeAuditEvent.findUnique({ where: { canonicalEventId: proposed.eventId }, select: { details: true } });
      if (raced) return parseCanonicalAiTelemetryEvent(raced.details);
    }
    throw error;
  }
}

export async function appendCanonicalEventInTransaction(event: CanonicalAiTelemetryEvent) {
  return prisma.$transaction((tx) => appendCanonicalEvent(tx, event), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
