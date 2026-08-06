import { parsePressAiProcessEvent, type PressAiProcessEvent } from "@/domain/press-ai-debugger/processEvents";
import { prisma } from "@/lib/prisma";
import { ALLOWED_DEBUGGER_LAUNCH_SURFACES, PRESS_AI_PROCESS_EVENT_TYPE } from "./processPersistence";

function inputRecord(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

export async function replayPressAiProcessEvents(args: { teamId: string; userId: string; runId: string; afterSequence?: number }) {
  const run = await prisma.agentRun.findFirst({ where: { id: args.runId, teamId: args.teamId, startedById: args.userId }, select: { id: true, status: true, articleId: true, createdAt: true, completedAt: true, input: true, output: true } });
  const input = inputRecord(run?.input);
  if (!run || !ALLOWED_DEBUGGER_LAUNCH_SURFACES.includes(input?.launchSurface as never)) throw Object.assign(new Error("PRESS_AI_PROCESS_RUN_NOT_FOUND"), { status: 404, code: "PRESS_AI_PROCESS_RUN_NOT_FOUND" });
  if (input?.launchSurface === "RAG_DEBUGGER_V1") {
    const { replayPressAgentWorkflowEvents } = await import("@/lib/services/press-agent/pressAgentWorkflowEventService");
    return replayPressAgentWorkflowEvents(args);
  }
  const rows = await prisma.agentRuntimeAuditEvent.findMany({ where: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AI_PROCESS_EVENT_TYPE }, select: { details: true } });
  const events = rows.map((row) => { try { return parsePressAiProcessEvent(inputRecord(row.details)?.publicEvent); } catch { return null; } }).filter((entry): entry is PressAiProcessEvent => entry !== null && entry.runId === args.runId).sort((a, b) => a.sequence - b.sequence).filter((entry) => entry.sequence > (args.afterSequence ?? 0));
  return { run: { id: run.id, status: run.status, articleId: run.articleId, processId: input?.processId, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null, output: run.output }, events };
}

export async function listPressAiProcessRuns(args: { teamId: string; userId: string; limit?: number }) {
  const runs = await prisma.agentRun.findMany({ where: { teamId: args.teamId, startedById: args.userId, OR: ALLOWED_DEBUGGER_LAUNCH_SURFACES.map((surface) => ({ input: { path: ["launchSurface"], equals: surface } })) }, select: { id: true, status: true, articleId: true, createdAt: true, completedAt: true, input: true }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(args.limit ?? 20, 1), 50) });
  return runs.map((run) => { const input = inputRecord(run.input); return { id: run.id, processId: input?.processId ?? "rag-query", status: run.status, articleId: run.articleId, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null }; });
}

