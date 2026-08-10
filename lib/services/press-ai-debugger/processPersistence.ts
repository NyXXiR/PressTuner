import { randomUUID } from "node:crypto";
import { Prisma, type AgentStepStatus } from "@prisma/client";

import { parsePressAiProcessEvent, type PressAiProcessEvent, type PressAiProcessEventInput } from "@/domain/press-ai-debugger/processEvents";
import { boundProcessDetail } from "@/domain/press-ai-debugger/processDetails";
import { getPressAiProcessDefinition, type PressAiProcessId } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import { mapPressProcessEvent } from "@/domain/ai-telemetry/pressMapper";
import { generateCanonicalTraceId } from "@/domain/ai-telemetry/identifiers";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { exportRunTelemetry } from "@/lib/services/ai-telemetry/otlpExporter";
import { beginOpsConsoleOperation, completeOpsConsoleOperation, type OpsConsoleOperationResult } from "@/lib/services/operations/opsConsoleOperationClient";

export const PRESS_AI_PROCESS_EVENT_TYPE = "PUBLIC_PROCESS_EVENT_V1";
export const PRESS_AI_DEBUGGER_LAUNCH_SURFACE = "PRESS_AI_PROCESS_DEBUGGER_V1";
export const ALLOWED_DEBUGGER_LAUNCH_SURFACES = [PRESS_AI_DEBUGGER_LAUNCH_SURFACE, "RAG_DEBUGGER_V1"] as const;

const json = (value: unknown) => boundProcessDetail(value) as Prisma.InputJsonValue;
const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProcessObservabilityDependencies = {
  beginOperation: typeof beginOpsConsoleOperation;
  completeOperation: typeof completeOpsConsoleOperation;
  exportTelemetry: typeof exportRunTelemetry;
  generateTraceId: typeof generateCanonicalTraceId;
};

const observabilityDefaults: ProcessObservabilityDependencies = {
  beginOperation: beginOpsConsoleOperation,
  completeOperation: completeOpsConsoleOperation,
  exportTelemetry: exportRunTelemetry,
  generateTraceId: generateCanonicalTraceId,
};

export function readProcessOperationId(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const operationId = (input as Record<string, unknown>).operationId;
  return typeof operationId === "string" && OPERATION_ID_PATTERN.test(operationId) ? operationId : null;
}

async function recordObservabilityFailure(args: { teamId: string; runId: string; phase: "MANIFEST" | "BEGIN" | "FACTS" | "COMPLETE" | "EXPORT"; code: string }) {
  try {
    await prisma.agentRuntimeAuditEvent.create({ data: { teamId: args.teamId, runId: args.runId, eventType: "OBSERVABILITY_DELIVERY_FAILED", details: { phase: args.phase, errorCode: args.code } } });
  } catch {
    // Observability diagnostics must never change process execution.
  }
}

export async function createPressProcessRun(args: { teamId: string; userId: string; processId: PressAiProcessId; input: Record<string, unknown>; enableObservability?: boolean }, overrides: Partial<ProcessObservabilityDependencies> = {}) {
  const dependencies = { ...observabilityDefaults, ...overrides };
  const process = getPressAiProcessDefinition(args.processId);
  const traceId = dependencies.generateTraceId();
  const privateInput = { launchSurface: PRESS_AI_DEBUGGER_LAUNCH_SURFACE, processId: process.id, processVersion: process.version, initialInput: args.input };
  const run = await prisma.agentRun.create({
    data: {
      teamId: args.teamId, startedById: args.userId, status: "RUNNING", agentVersion: `press-ai-debugger:${process.version}`, model: "domain-process",
      input: json(privateInput), traceId, startedAt: new Date(),
      steps: { create: process.nodes.map((node, index) => ({ sequence: index + 1, kind: "DOMAIN_PROCESS", toolName: node.id, status: "PENDING", idempotencyKey: `${randomUUID()}:${node.id}` })) },
    },
    select: { id: true, status: true, traceId: true, createdAt: true },
  });
  if (args.enableObservability !== true) return run;
  try {
    const workflowId = args.processId === "press-creation" ? "presstuner.press-creation" : "presstuner.press-agent";
    const workflowVersion = args.processId === "press-creation" ? "2.0.0" : "press-agent-v2";
    const operation = await dependencies.beginOperation({ teamId: args.teamId, userId: args.userId, workflowId, workflowVersion, traceId });
    if (operation.status === "registered") {
      await prisma.agentRun.update({ where: { id: run.id }, data: { input: json({ ...privateInput, operationId: operation.operationId }) } });
    } else if (operation.status === "failed") {
      await recordObservabilityFailure({ teamId: args.teamId, runId: run.id, phase: "BEGIN", code: operation.code });
    }
  } catch {
    await recordObservabilityFailure({ teamId: args.teamId, runId: run.id, phase: "BEGIN", code: "OPS_CONSOLE_NETWORK_ERROR" });
  }
  return run;
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

export async function finalizeProcessRunObservability(args: { teamId: string; runId: string; processId: PressAiProcessId; status: "succeeded" | "warning" | "failed" | "cancelled" | "blocked"; findingCode?: string | null; observer?: (event: PressAiProcessEvent) => void | Promise<void> }, overrides: Partial<ProcessObservabilityDependencies> = {}) {
  const dependencies = { ...observabilityDefaults, ...overrides };
  await persistProcessEvent({ teamId: args.teamId, runId: args.runId, processId: args.processId, event: { type: "run.finished", dedupeKey: "run:terminal", run: { status: args.status, findingCode: args.findingCode ?? null } }, observer: args.observer });

  let operationId: string | null = null;
  try {
    const run = await prisma.agentRun.findUnique({ where: { id: args.runId }, select: { input: true } });
    operationId = readProcessOperationId(run?.input);
  } catch {
    // Terminal process persistence is authoritative; observability lookup is fail-open.
  }
  try {
    const result = await dependencies.exportTelemetry({ teamId: args.teamId, runId: args.runId });
    if (result.status === "failed") await recordObservabilityFailure({ teamId: args.teamId, runId: args.runId, phase: "EXPORT", code: result.code });
  } catch {
    await recordObservabilityFailure({ teamId: args.teamId, runId: args.runId, phase: "EXPORT", code: "OTLP_NETWORK_ERROR" });
  }
  if (operationId) {
    try {
      const result: OpsConsoleOperationResult = await dependencies.completeOperation({ operationId });
      if (result.status === "failed") await recordObservabilityFailure({ teamId: args.teamId, runId: args.runId, phase: "COMPLETE", code: result.code });
    } catch {
      await recordObservabilityFailure({ teamId: args.teamId, runId: args.runId, phase: "COMPLETE", code: "OPS_CONSOLE_NETWORK_ERROR" });
    }
  }
}

export async function failProcessRun(args: { teamId: string; runId: string; processId: PressAiProcessId; nodeId: string; error: unknown; articleId?: string; observer?: (event: PressAiProcessEvent) => void | Promise<void> }) {
  const error = args.error instanceof Error ? args.error : new Error("PRESS_AI_PROCESS_FAILED");
  const process = getPressAiProcessDefinition(args.processId);
  await updateProcessStep({ runId: args.runId, nodeId: args.nodeId, status: "FAILED", error });
  const ordinal = process.nodes.findIndex((node) => node.id === args.nodeId);
  await prisma.agentStep.updateMany({ where: { runId: args.runId, sequence: { gt: ordinal + 1 }, status: "PENDING" }, data: { status: "SKIPPED", completedAt: new Date() } });
  await prisma.agentRun.update({ where: { id: args.runId }, data: { status: "FAILED", articleId: args.articleId, errorCode: (error as Error & { code?: string }).code ?? error.message.slice(0, 100), errorMessage: error.message.slice(0, 4_000), completedAt: new Date(), output: json({ cursor: args.nodeId, articleId: args.articleId ?? null }) } });
  await persistProcessEvent({ teamId: args.teamId, runId: args.runId, processId: args.processId, event: { type: "node.state", dedupeKey: `node:${args.nodeId}:failed`, node: { id: args.nodeId, state: "failed", findingCode: null } }, observer: args.observer });
  await finalizeProcessRunObservability({ teamId: args.teamId, runId: args.runId, processId: args.processId, status: "failed", observer: args.observer });
}
