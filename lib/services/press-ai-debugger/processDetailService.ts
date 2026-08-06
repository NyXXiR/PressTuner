import { getPressAiProcessDefinition, isPressAiProcessId } from "@/domain/press-ai-debugger/processRegistry";
import { boundProcessDetail } from "@/domain/press-ai-debugger/processDetails";
import { prisma } from "@/lib/prisma";
import { getPressAgentRagDebuggerRunDetail, isPressAgentWorkflowStageId } from "@/lib/services/press-agent/pressAgentRagDebuggerDetailService";
import { PRESS_AI_DEBUGGER_LAUNCH_SURFACE } from "./processPersistence";

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

export async function getPressAiProcessDetail(args: { teamId: string; userId: string; runId: string; nodeId: string }) {
  const run = await prisma.agentRun.findFirst({ where: { id: args.runId, teamId: args.teamId, startedById: args.userId }, select: { id: true, status: true, articleId: true, input: true, output: true, createdAt: true, completedAt: true } });
  const input = record(run?.input);
  if (!run) throw Object.assign(new Error("PRESS_AI_PROCESS_RUN_NOT_FOUND"), { status: 404 });
  if (input?.launchSurface === "RAG_DEBUGGER_V1" && isPressAgentWorkflowStageId(args.nodeId)) return getPressAgentRagDebuggerRunDetail({ teamId: args.teamId, userId: args.userId, runId: args.runId, stageId: args.nodeId });
  if (input?.launchSurface !== PRESS_AI_DEBUGGER_LAUNCH_SURFACE || typeof input.processId !== "string" || !isPressAiProcessId(input.processId)) throw Object.assign(new Error("PRESS_AI_PROCESS_RUN_NOT_FOUND"), { status: 404 });
  const process = getPressAiProcessDefinition(input.processId); const node = process.nodes.find((entry) => entry.id === args.nodeId);
  if (!node) throw Object.assign(new Error("PRESS_AI_PROCESS_NODE_INVALID"), { status: 400 });
  const step = await prisma.agentStep.findFirst({ where: { runId: run.id, kind: "DOMAIN_PROCESS", toolName: node.id }, select: { status: true, inputSummary: true, outputSummary: true, errorCode: true, errorMessage: true, startedAt: true, completedAt: true } });
  return { schemaVersion: "press-ai-process-detail/v1", run: { id: run.id, status: run.status, articleId: run.articleId, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null }, processId: process.id, processVersion: process.version, node: { id: node.id, label: node.label, description: node.description, troubleshooting: node.troubleshooting }, step: step ? boundProcessDetail({ ...step, startedAt: step.startedAt?.toISOString() ?? null, completedAt: step.completedAt?.toISOString() ?? null }) : null, currentOutput: boundProcessDetail(run.output) };
}

