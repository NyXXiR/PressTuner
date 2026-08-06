import { randomUUID } from "node:crypto";
import { Prisma, type AgentStepStatus } from "@prisma/client";

import { parsePressAiProcessEvent, type PressAiProcessEvent, type PressAiProcessEventInput } from "@/domain/press-ai-debugger/processEvents";
import { boundProcessDetail } from "@/domain/press-ai-debugger/processDetails";
import { getPressAiProcessDefinition, type PressAiProcessId } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import { mapPressProcessEvent } from "@/domain/ai-telemetry/pressMapper";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";

export const PRESS_AI_PROCESS_EVENT_TYPE = "PUBLIC_PROCESS_EVENT_V1";
export const PRESS_AI_DEBUGGER_LAUNCH_SURFACE = "PRESS_AI_PROCESS_DEBUGGER_V1";
export const ALLOWED_DEBUGGER_LAUNCH_SURFACES = [PRESS_AI_DEBUGGER_LAUNCH_SURFACE, "RAG_DEBUGGER_V1"] as const;

const json = (value: unknown) => boundProcessDetail(value) as Prisma.InputJsonValue;

export async function createPressProcessRun(args: { teamId: string; userId: string; processId: PressAiProcessId; input: Record<string, unknown> }) {
  const process = getPressAiProcessDefinition(args.processId);
  return prisma.agentRun.create({
    data: {
      teamId: args.teamId, startedById: args.userId, status: "RUNNING", agentVersion: `press-ai-debugger:${process.version}`, model: "domain-process",
      input: json({ launchSurface: PRESS_AI_DEBUGGER_LAUNCH_SURFACE, processId: process.id, processVersion: process.version, initialInput: args.input }), startedAt: new Date(),
      steps: { create: process.nodes.map((node, index) => ({ sequence: index + 1, kind: "DOMAIN_PROCESS", toolName: node.id, status: "PENDING", idempotencyKey: `${randomUUID()}:${node.id}` })) },
    },
    select: { id: true, status: true, traceId: true, createdAt: true },
  });
}

export async function updateProcessStep(args: { runId: string; nodeId: string; status: AgentStepStatus; input?: unknown; output?: unknown; error?: unknown }) {
  const error = args.error instanceof Error ? args.error : null;
  return prisma.agentStep.updateMany({ where: { runId: args.runId, toolName: args.nodeId, kind: "DOMAIN_PROCESS" }, data: { status: args.status, inputSummary: args.input === undefined ? undefined : json(args.input), outputSummary: args.output === undefined ? undefined : json(args.output), errorCode: error ? (error as Error & { code?: string }).code ?? error.message.slice(0, 100) : undefined, errorMessage: error?.message.slice(0, 4_000), startedAt: args.status === "RUNNING" ? new Date() : undefined, completedAt: ["COMPLETED", "FAILED", "SKIPPED"].includes(args.status) ? new Date() : undefined } });
}

export async function persistProcessEvent(args: { teamId: string; runId: string; processId: PressAiProcessId; event: PressAiProcessEventInput; observer?: (event: PressAiProcessEvent) => void | Promise<void> }): Promise<PressAiProcessEvent> {
  const process = getPressAiProcessDefinition(args.processId);
  const persisted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM agent_run WHERE id = ${args.runId} AND team_id = ${args.teamId} FOR UPDATE`;
    const rows = await tx.agentRuntimeAuditEvent.findMany({ where: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AI_PROCESS_EVENT_TYPE }, select: { details: true } });
    const existing = rows.map((row) => { const value = row.details as Record<string, unknown>; try { return parsePressAiProcessEvent(value.publicEvent); } catch { return null; } }).filter((entry): entry is PressAiProcessEvent => entry !== null);
    const duplicate = existing.find((entry) => entry.dedupeKey === args.event.dedupeKey);
    if (duplicate) return duplicate;
    const occurredAt = new Date();
    const event = parsePressAiProcessEvent({ schemaVersion: "press-ai-process-event/v1", processId: process.id, processVersion: process.version, eventId: randomUUID(), runId: args.runId, sequence: Math.max(0, ...existing.map((entry) => entry.sequence)) + 1, occurredAt: occurredAt.toISOString(), ...args.event });
    await tx.agentRuntimeAuditEvent.create({ data: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AI_PROCESS_EVENT_TYPE, occurredAt, details: json({ publicEvent: event }) } });
    const run = await tx.agentRun.findUnique({ where: { id: args.runId }, select: { traceId: true } });
    const attempt = await tx.pressAiDebugAttempt.findUnique({ where: { agentRunId: args.runId }, select: { id: true, parentAttemptId: true, caseId: true, registryHash: true } });
    const canonicalEvent = mapPressProcessEvent({ teamId: args.teamId, runId: args.runId, traceId: run?.traceId, attemptId: attempt?.id ?? args.runId, parentAttemptId: attempt?.parentAttemptId, caseId: attempt?.caseId, processId: process.id, processVersion: process.version, registryHash: attempt?.registryHash }, event);
    if (canonicalEvent) await appendCanonicalEvent(tx, canonicalEvent);
    return event;
  });
  await args.observer?.(persisted);
  return persisted;
}

export async function setProcessWaiting(args: { teamId: string; runId: string; processId: PressAiProcessId; nodeId: string; gateId: string; output: unknown; articleId?: string; observer?: (event: PressAiProcessEvent) => void | Promise<void> }) {
  await prisma.agentRun.update({ where: { id: args.runId }, data: { status: "WAITING_APPROVAL", articleId: args.articleId, output: json(args.output) } });
  await updateProcessStep({ runId: args.runId, nodeId: args.nodeId, status: "WAITING_APPROVAL", output: args.output });
  return persistProcessEvent({ teamId: args.teamId, runId: args.runId, processId: args.processId, event: { type: "run.waiting-input", dedupeKey: `gate:${args.gateId}`, gate: { id: args.gateId, nodeId: args.nodeId } }, observer: args.observer });
}

export async function failProcessRun(args: { teamId: string; runId: string; processId: PressAiProcessId; nodeId: string; error: unknown; articleId?: string; observer?: (event: PressAiProcessEvent) => void | Promise<void> }) {
  const error = args.error instanceof Error ? args.error : new Error("PRESS_AI_PROCESS_FAILED");
  const process = getPressAiProcessDefinition(args.processId);
  await updateProcessStep({ runId: args.runId, nodeId: args.nodeId, status: "FAILED", error });
  const ordinal = process.nodes.findIndex((node) => node.id === args.nodeId);
  await prisma.agentStep.updateMany({ where: { runId: args.runId, sequence: { gt: ordinal + 1 }, status: "PENDING" }, data: { status: "SKIPPED", completedAt: new Date() } });
  await prisma.agentRun.update({ where: { id: args.runId }, data: { status: "FAILED", articleId: args.articleId, errorCode: (error as Error & { code?: string }).code ?? error.message.slice(0, 100), errorMessage: error.message.slice(0, 4_000), completedAt: new Date(), output: json({ cursor: args.nodeId, articleId: args.articleId ?? null }) } });
  await persistProcessEvent({ teamId: args.teamId, runId: args.runId, processId: args.processId, event: { type: "node.state", dedupeKey: `node:${args.nodeId}:failed`, node: { id: args.nodeId, state: "failed", findingCode: null } }, observer: args.observer });
  await persistProcessEvent({ teamId: args.teamId, runId: args.runId, processId: args.processId, event: { type: "run.finished", dedupeKey: "run:terminal", run: { status: "failed", findingCode: null } }, observer: args.observer });
}
