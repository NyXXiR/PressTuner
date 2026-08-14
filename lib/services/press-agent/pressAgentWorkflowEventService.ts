import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  PRESS_AGENT_WORKFLOW_EDGES,
  PRESS_AGENT_WORKFLOW_STAGE_IDS,
  PressAgentWorkflowEventV1Schema,
  parsePressAgentWorkflowEvent,
  projectPressAgentWorkflow,
  type PressAgentWorkflowEventInput,
  type PressAgentWorkflowEventV1,
} from "@/domain/evaluation/pressAgentWorkflowEvents";
import { prisma } from "@/lib/prisma";
import { parsePressAiProcessEvent } from "@/domain/press-ai-debugger/processEvents";
import { mapPressProcessEvent } from "@/domain/ai-telemetry/pressMapper";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { ObservabilityReferenceV1Schema } from "@/domain/ai-process-console/v1/contracts";
import { createResolvedFactFactory } from "@/domain/ai-process-console/v1/factEvents";
import { hasPressAgentWorkflowFactProjection, projectPressAgentWorkflowFact } from "@/domain/ai-process-console/v1/pressAgentFactProjection";
import { AI_PROCESS_CONSOLE_SOURCE, buildRagQueryProcessDefinition } from "@/domain/ai-process-console/v1/publication";
import { readPressAgentOperationId } from "@/domain/evaluation/pressAgentOperationId";
import { enqueueNextAiProcessFact } from "@/lib/services/ai-process-console/factOutbox";

export const PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE = "PUBLIC_WORKFLOW_EVENT_V1";
export const PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE = "RAG_DEBUGGER_V1";

export type PressAgentWorkflowStreamObserver = (event: PressAgentWorkflowEventV1) => void | Promise<void>;
const observerStorage = new AsyncLocalStorage<PressAgentWorkflowStreamObserver>();

function readPublicEvent(details: unknown): PressAgentWorkflowEventV1 | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const parsed = PressAgentWorkflowEventV1Schema.safeParse((details as Record<string, unknown>).publicEvent);
  if (!parsed.success) return null;
  try { return parsePressAgentWorkflowEvent(parsed.data); } catch { return null; }
}

export function hasPressAgentWorkflowObserver() {
  return observerStorage.getStore() !== undefined;
}

export async function withPressAgentWorkflowObserver<T>(observer: PressAgentWorkflowStreamObserver, execute: () => Promise<T>) {
  return observerStorage.run(observer, execute);
}

export async function persistPressAgentWorkflowEvent(args: {
  teamId: string;
  runId: string;
  event: PressAgentWorkflowEventInput;
}): Promise<PressAgentWorkflowEventV1> {
  const persisted = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; traceId: string | null; input: Prisma.JsonValue }>>`SELECT id, trace_id AS "traceId", input FROM agent_run WHERE id = ${args.runId} AND team_id = ${args.teamId} FOR UPDATE`;
    if (locked.length !== 1) throw new Error("PRESS_AGENT_RUN_NOT_FOUND");
    const lockedRun = locked[0];
    const rows = await tx.agentRuntimeAuditEvent.findMany({
      where: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE },
      select: { details: true },
    });
    const events = rows.map((row) => readPublicEvent(row.details)).filter((entry): entry is PressAgentWorkflowEventV1 => entry !== null);
    const duplicate = events.find((entry) => entry.dedupeKey === args.event.dedupeKey);
    if (duplicate) return duplicate;
    const occurredAt = new Date();
    const event = parsePressAgentWorkflowEvent({
      schemaVersion: "press-agent-workflow-event/v1",
      eventId: randomUUID(),
      runId: args.runId,
      sequence: Math.max(0, ...events.map((entry) => entry.sequence)) + 1,
      occurredAt: occurredAt.toISOString(),
      ...args.event,
    });
    await tx.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.teamId,
        runId: args.runId,
        eventType: PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE,
        occurredAt,
        details: { publicEvent: event } as unknown as Prisma.InputJsonValue,
      },
    });
    const canonicalEvent = mapPressProcessEvent({ teamId: args.teamId, runId: args.runId, traceId: lockedRun.traceId, attemptId: args.runId, processId: "rag-query", processVersion: "1.0.0", registryHash: "legacy-rag-v1" }, parsePressAiProcessEvent(event));
    if (canonicalEvent) await appendCanonicalEvent(tx, canonicalEvent);
    if (hasPressAgentWorkflowFactProjection(event)) {
      const definition = buildRagQueryProcessDefinition();
      const parsedTrace = lockedRun.traceId
        ? ObservabilityReferenceV1Schema.safeParse({ provider: "LANGSMITH", traceId: lockedRun.traceId })
        : null;
      const operationId = readPressAgentOperationId(lockedRun.input);
      const factory = createResolvedFactFactory({
        definition,
        executionMode: "LIVE",
        identity: {
          caseId: args.runId,
          objectType: "press-agent-rag-query",
          ...(operationId ? { operationId } : {}),
          attemptId: args.runId,
          correlationId: args.runId,
          ...(parsedTrace?.success ? { trace: parsedTrace.data } : {}),
        },
      });
      await enqueueNextAiProcessFact(tx, {
        source: AI_PROCESS_CONSOLE_SOURCE,
        attemptId: args.runId,
        build: (sequence) => {
          const fact = projectPressAgentWorkflowFact({ event, priorEvents: events, factory, sequence });
          if (!fact) throw new Error("PRESS_AGENT_WORKFLOW_FACT_PROJECTION_MISSING");
          return fact;
        },
      });
    }
    return event;
  });
  try {
    await observerStorage.getStore()?.(persisted);
  } catch {
    // Persistence is authoritative; a disconnected stream must not fail the run.
  }
  return persisted;
}

export async function replayPressAgentWorkflowEvents(args: { teamId: string; userId: string; runId: string; afterSequence?: number }) {
  const run = await prisma.agentRun.findFirst({
    where: { id: args.runId, teamId: args.teamId, startedById: args.userId },
    select: { id: true, status: true, createdAt: true, input: true },
  });
  const input = run?.input && typeof run.input === "object" && !Array.isArray(run.input) ? run.input as Record<string, unknown> : null;
  if (!run || input?.launchSurface !== PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE) throw new Error("PRESS_AGENT_DEBUG_RUN_NOT_FOUND");
  const rows = await prisma.agentRuntimeAuditEvent.findMany({
    where: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE },
    select: { details: true },
  });
  const events = rows.map((row) => readPublicEvent(row.details)).filter((entry): entry is PressAgentWorkflowEventV1 => entry !== null && entry.runId === args.runId).sort((a, b) => a.sequence - b.sequence).filter((entry) => entry.sequence > (args.afterSequence ?? 0));
  return { run: { id: run.id, status: run.status, createdAt: run.createdAt.toISOString() }, events };
}

export async function listPressAgentRagDebuggerRuns(args: { teamId: string; userId: string; limit?: number }) {
  const runs = await prisma.agentRun.findMany({
    where: {
      teamId: args.teamId,
      startedById: args.userId,
      input: { path: ["launchSurface"], equals: PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE },
    },
    select: { id: true, status: true, createdAt: true, completedAt: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(args.limit ?? 20, 1), 50),
  });
  return runs.map((run) => ({ id: run.id, status: run.status, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null }));
}

export async function persistPressAgentCancellationWorkflow(args: { teamId: string; runId: string }) {
  const rows = await prisma.agentRuntimeAuditEvent.findMany({
    where: { teamId: args.teamId, runId: args.runId, eventType: PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE },
    select: { details: true },
  });
  const events = rows.map((row) => readPublicEvent(row.details)).filter((entry): entry is PressAgentWorkflowEventV1 => entry !== null);
  const projection = projectPressAgentWorkflow(events);
  if (projection.runStatus !== "running") return;
  for (const id of PRESS_AGENT_WORKFLOW_STAGE_IDS) {
    const current = projection.stages[id];
    if (id === "terminal-evaluation" || current.state === "running") {
      await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: args.runId, event: { type: "stage.state", dedupeKey: `cancel:stage:${id}`, stage: { id, state: "blocked", findingCode: "user-cancelled" } } });
    } else if (current.state === "waiting") {
      await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: args.runId, event: { type: "stage.state", dedupeKey: `cancel:stage:${id}`, stage: { id, state: "skipped", findingCode: "user-cancelled" } } });
    }
  }
  for (const edge of PRESS_AGENT_WORKFLOW_EDGES) {
    if (projection.edges[edge.id].state !== "pending") continue;
    const blocked = projection.stages[edge.source].state === "running";
    await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: args.runId, event: { type: "edge.state", dedupeKey: `cancel:edge:${edge.id}`, edge: { ...edge, state: blocked ? "blocked" : "not-taken", findingCode: blocked ? "user-cancelled" : null } } });
  }
  await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: args.runId, event: { type: "run.finished", dedupeKey: "run:terminal", run: { status: "cancelled", findingCode: "user-cancelled" } } });
}
