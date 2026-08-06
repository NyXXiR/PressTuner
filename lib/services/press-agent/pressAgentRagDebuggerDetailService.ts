import { PRESS_AGENT_WORKFLOW_STAGE_IDS, PressAgentWorkflowEventV1Schema, projectPressAgentWorkflow, type PressAgentWorkflowEventV1, type PressAgentWorkflowStageId } from "@/domain/evaluation/pressAgentWorkflowEvents";
import { projectPressAgentRagDebuggerDetail, type RagDebuggerStoredSource } from "@/domain/evaluation/pressAgentRagDebuggerDetails";
import { prisma } from "@/lib/prisma";
import { PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE, PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE } from "./pressAgentWorkflowEventService";

export class PressAgentRagDebuggerDetailNotFoundError extends Error {
  code = "PRESS_AGENT_DEBUG_RUN_NOT_FOUND";
  status = 404;
  constructor() { super("PRESS_AGENT_DEBUG_RUN_NOT_FOUND"); }
}

function readEvent(value: unknown): PressAgentWorkflowEventV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = PressAgentWorkflowEventV1Schema.safeParse((value as Record<string, unknown>).publicEvent);
  return parsed.success ? parsed.data : null;
}

function storedSource(value: { sourceId: string; documentId: string; documentName: string; pageStart: number; pageEnd: number; excerpt: string; score?: number | null }): RagDebuggerStoredSource {
  return { sourceId: value.sourceId, documentId: value.documentId, documentName: value.documentName, pageStart: value.pageStart, pageEnd: value.pageEnd, excerpt: value.excerpt, score: value.score ?? null };
}

export async function getPressAgentRagDebuggerRunDetail(args: { teamId: string; userId: string; runId: string; stageId: PressAgentWorkflowStageId }) {
  const run = await prisma.agentRun.findFirst({
    where: { id: args.runId, teamId: args.teamId, startedById: args.userId, input: { path: ["launchSurface"], equals: PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE } },
    select: { id: true, status: true, createdAt: true, completedAt: true, input: true, output: true },
  });
  if (!run) throw new PressAgentRagDebuggerDetailNotFoundError();

  const [eventRows, retrievedSources, citations] = await Promise.all([
    prisma.agentRuntimeAuditEvent.findMany({ where: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE }, select: { details: true } }),
    ["retrieval-execution", "evidence-decision", "response-behavior", "verification"].includes(args.stageId)
      ? prisma.agentRetrievedSource.findMany({ where: { runId: args.runId }, select: { sourceId: true, documentId: true, documentName: true, pageStart: true, pageEnd: true, excerpt: true, score: true }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    ["retrieval-execution", "evidence-decision", "response-behavior", "terminal-evaluation"].includes(args.stageId)
      ? prisma.agentCitation.findMany({ where: { runId: args.runId }, select: { sourceId: true, documentId: true, documentName: true, pageStart: true, pageEnd: true, excerpt: true }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
  ]);
  const events = eventRows.map((row) => readEvent(row.details)).filter((event): event is PressAgentWorkflowEventV1 => event !== null && event.runId === args.runId);
  const projection = projectPressAgentWorkflow(events);
  return projectPressAgentRagDebuggerDetail({ run, stageId: args.stageId, stageState: projection.stages[args.stageId].state, retrievedSources: retrievedSources.map(storedSource), citations: citations.map(storedSource) });
}

export function isPressAgentWorkflowStageId(value: string): value is PressAgentWorkflowStageId {
  return (PRESS_AGENT_WORKFLOW_STAGE_IDS as readonly string[]).includes(value);
}
