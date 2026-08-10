import { z } from "zod";
import {
  getBeginningRetryNodeId,
  isRetryNodeValid,
} from "@/domain/press-ai-debugger/retryPolicy";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import { createPressProcessRun } from "./processPersistence";
import { createPressDebugArticle } from "./processNodeExecutors";
import { json } from "./checkpointRepository";
import { hashPressAiDebugCommand, PressAiDebugConflictError } from "./commandRepository";
import { mapReplayStarted, mapRunLifecycle } from "@/domain/ai-telemetry/pressMapper";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";

export const RetryDebugAttemptSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative(), retryNodeId: z.string().optional() }).strict();
function rebase(value: unknown, oldArticleId: string, newArticleId: string): unknown { if (value === oldArticleId) return newArticleId; if (Array.isArray(value)) return value.map((item) => rebase(item, oldArticleId, newArticleId)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, rebase(item, oldArticleId, newArticleId)])); return value; }

export async function retryDebugAttempt(args: { teamId: string; userId: string; attemptId: string; input: z.infer<typeof RetryDebugAttemptSchema> }) {
  const existing = await prisma.pressAiDebugAttempt.findFirst({ where: { id: args.input.commandId, teamId: args.teamId } }); if (existing) return { replayed: true, attemptId: existing.id, articleId: existing.articleId, revision: existing.revision };
  const parent = await prisma.pressAiDebugAttempt.findFirst({ where: { id: args.attemptId, teamId: args.teamId }, include: { checkpoints: { orderBy: { sequence: "asc" } }, transitions: { where: { verdict: "BLOCK" }, orderBy: { sequence: "asc" } } } });
  if (!parent) throw Object.assign(new Error("PRESS_AI_DEBUG_ATTEMPT_NOT_FOUND"), { status: 404 });
  if (parent.revision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
  const defaultNode =
    parent.transitions[0]?.sourceNodeId ??
    parent.checkpoints.at(-1)?.nodeId ??
    getBeginningRetryNodeId(parent);
  const retryNodeId = args.input.retryNodeId ?? defaultNode;
  const retryNode = pressCreationProcess.nodes.find(
    (item) => item.id === retryNodeId,
  );
  if (!retryNode || !isRetryNodeValid(parent, retryNode.id))
    throw new PressAiDebugConflictError("PRESS_AI_DEBUG_RETRY_NODE_INVALID");
  const article = await createPressDebugArticle(args); const rebasedInput = rebase(parent.inputSnapshot, parent.articleId, article.id) as Record<string, unknown>;
  const run = await createPressProcessRun({ teamId: args.teamId, userId: args.userId, processId: "press-creation", input: rebasedInput });
  const child = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM press_ai_debug_attempt WHERE id = ${parent.id} AND team_id = ${args.teamId} FOR UPDATE`;
    const current = await tx.pressAiDebugAttempt.findUnique({ where: { id: parent.id }, select: { revision: true } }); if (current?.revision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
    const created = await tx.pressAiDebugAttempt.create({ data: { id: args.input.commandId, teamId: args.teamId, createdById: args.userId, caseId: parent.caseId, agentRunId: run.id, parentAttemptId: parent.id, baselineAttemptId: parent.baselineAttemptId ?? parent.id, processId: parent.processId, processVersion: parent.processVersion, registryHash: parent.registryHash, executorVersion: parent.executorVersion, startNodeId: retryNode.id, activeNodeId: retryNode.id, status: "ACTIVE", articleId: article.id, inputSnapshot: json(rebasedInput) } });
    for (const checkpoint of parent.checkpoints.filter((item) => item.sequence < retryNode.sequence)) await tx.pressAiDebugCheckpoint.create({ data: { attemptId: created.id, nodeId: checkpoint.nodeId, sequence: checkpoint.sequence, mode: "RESTORED", input: json(rebase(checkpoint.input, parent.articleId, article.id)), output: json(rebase(checkpoint.output, parent.articleId, article.id)), restoredFromCheckpointId: checkpoint.id, quotaUnits: 0, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash, executorVersion: checkpoint.executorVersion } });
    await tx.pressAiDebugCommand.create({ data: { attemptId: parent.id, commandId: args.input.commandId, kind: "RETRY", expectedRevision: args.input.expectedRevision, requestHash: hashPressAiDebugCommand(args.input), response: json({ attemptId: created.id, articleId: article.id, revision: 0 }) } });
    const context = { teamId: args.teamId, runId: run.id, traceId: run.traceId, attemptId: created.id, parentAttemptId: parent.id, caseId: parent.caseId, processId: parent.processId, processVersion: parent.processVersion, registryHash: parent.registryHash, executionMode: "REPLAY" as const };
    await appendCanonicalEvent(tx, mapRunLifecycle(context, "STARTED"));
    await appendCanonicalEvent(tx, mapReplayStarted(context, { sourceAttemptId: parent.id, restoredCheckpointId: parent.checkpoints.find((item) => item.nodeId === retryNode.id)?.id ?? null, caseId: parent.caseId }));
    await tx.pressAiDebugAttempt.update({ where: { id: parent.id }, data: { revision: { increment: 1 } } }); return created;
  });
  return { replayed: false, attemptId: child.id, articleId: child.articleId, revision: child.revision };
}
