import { Prisma } from "@prisma/client";

import { buildPressTunerDebugRunSnapshot, hashPressTunerDebugRunSnapshot, PressTunerDebugRunSnapshotSchema } from "@/domain/press-ai-debugger/presstunerDebugRunContract";
import { prisma } from "@/lib/prisma";
import { deliverPressTunerDebugSnapshot } from "@/lib/services/operations/presstunerDebugSnapshotClient";
import { debugSnapshotAttemptInclude } from "./checkpointRepository";

const payloadJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const environment = () => process.env.OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT?.trim() || process.env.NODE_ENV || "unknown";

export async function enqueueDebugRunSnapshot(tx: Prisma.TransactionClient, attemptId: string, capturedAt?: Date) {
  await tx.$queryRaw`SELECT id FROM press_ai_debug_attempt WHERE id = ${attemptId} FOR UPDATE`;
  const attempt = await tx.pressAiDebugAttempt.findUnique({ where: { id: attemptId }, include: debugSnapshotAttemptInclude }); if (!attempt) throw new Error("PRESS_AI_DEBUG_ATTEMPT_NOT_FOUND");
  const latest = await tx.pressTunerDebugSnapshotOutbox.findFirst({ where: { attemptId }, orderBy: { snapshotRevision: "desc" }, select: { snapshotRevision: true } });
  const snapshot = buildPressTunerDebugRunSnapshot({ attempt, checkpoints: attempt.checkpoints, transitions: attempt.transitions, steps: attempt.agentRun.steps }, { environment: environment(), snapshotRevision: (latest?.snapshotRevision ?? 0) + 1, capturedAt });
  const contentHash = hashPressTunerDebugRunSnapshot(snapshot);
  const duplicate = await tx.pressTunerDebugSnapshotOutbox.findUnique({ where: { attemptId_contentHash: { attemptId, contentHash } } }); if (duplicate) return { row: duplicate, created: false };
  const row = await tx.pressTunerDebugSnapshotOutbox.create({ data: { attemptId, snapshotRevision: snapshot.snapshotRevision, contentHash, payload: payloadJson(snapshot) } }); return { row, created: true };
}

export async function flushDebugRunSnapshots(attemptId?: string) {
  try {
    const now = new Date(); const rows = await prisma.pressTunerDebugSnapshotOutbox.findMany({ where: { deliveryState: "PENDING", ...(attemptId ? { attemptId } : {}), OR: [{ retryAt: null }, { retryAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: 10 });
    for (const row of rows) {
      const parsed = PressTunerDebugRunSnapshotSchema.safeParse(row.payload); const result = parsed.success ? await deliverPressTunerDebugSnapshot(parsed.data) : { status: "terminal" as const, code: "OPS_CONSOLE_CONTRACT_ERROR" as const };
      if (result.status === "delivered") await prisma.pressTunerDebugSnapshotOutbox.update({ where: { id: row.id }, data: { deliveryState: "DELIVERED", deliveredAt: new Date(), safeErrorCode: null, retryAt: null, attemptCount: { increment: 1 } } });
      else if (result.status === "terminal") await prisma.pressTunerDebugSnapshotOutbox.update({ where: { id: row.id }, data: { deliveryState: result.code === "OPS_CONSOLE_AUTH_ERROR" ? "CONFIGURATION_FAILURE" : result.code === "OPS_CONSOLE_DELIVERY_CONFLICT" ? "DELIVERY_CONFLICT" : "CONTRACT_FAILURE", safeErrorCode: result.code, retryAt: null, attemptCount: { increment: 1 } } });
      else await prisma.pressTunerDebugSnapshotOutbox.update({ where: { id: row.id }, data: { safeErrorCode: result.code, retryAt: result.code === "OPS_CONSOLE_DISABLED" ? null : new Date(Date.now() + 30_000), attemptCount: { increment: 1 } } });
    }
  } catch { /* fail-open: checkpoint persistence is authoritative */ }
}

export async function enqueueAndFlushFailedDebugRun(args: { attemptId: string; runId: string; nodeId: string; reasonCode: string }) {
  try { await prisma.$transaction(async (tx) => { const now = new Date(); await tx.agentStep.updateMany({ where: { runId: args.runId, toolName: args.nodeId, kind: "DOMAIN_PROCESS" }, data: { status: "FAILED", errorCode: args.reasonCode, completedAt: now } }); await enqueueDebugRunSnapshot(tx, args.attemptId, now); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); await flushDebugRunSnapshots(args.attemptId); } catch { /* fail-open */ }
}
