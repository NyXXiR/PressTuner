import { parseCanonicalAiTelemetryEvent, type CanonicalAiTelemetryEvent } from "@/domain/ai-telemetry/contracts";
import { batchOpsConsoleExecutionFacts, projectOpsConsoleExecutionFacts } from "@/domain/ai-telemetry/opsConsoleExecutionFactProjection";
import { OPS_CONSOLE_MAX_CANONICAL_EVENTS } from "@/domain/ai-telemetry/opsConsoleProducerContracts";
import { buildOpsConsoleWorkflowManifest } from "@/domain/press-ai-debugger/opsConsoleWorkflowManifest";
import type { PressAiProcessId } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import { CANONICAL_AI_TELEMETRY_EVENT_TYPE } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { appendOpsConsoleExecutionFacts, type OpsConsoleOperationResult } from "./opsConsoleOperationClient";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_DEADLINE_MS = 15_000;

type ExportDependencies = {
  loadEvents: (args: { teamId: string; runId: string; limit: number }) => Promise<unknown[]>;
  appendFacts: typeof appendOpsConsoleExecutionFacts;
  now: () => number;
};

const defaults: ExportDependencies = {
  loadEvents: async ({ teamId, runId, limit }) => (await prisma.agentRuntimeAuditEvent.findMany({ where: { teamId, runId, eventType: CANONICAL_AI_TELEMETRY_EVENT_TYPE }, select: { details: true }, orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }], take: limit })).map((row) => row.details),
  appendFacts: appendOpsConsoleExecutionFacts,
  now: Date.now,
};

async function withinDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  if (milliseconds <= 0) return null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), milliseconds); })]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type OpsConsoleExecutionFactExportResult =
  | { status: "exported" | "empty"; batches: number; facts: number }
  | { status: "disabled" | "failed"; code: string; batches: number; facts: number };

export async function exportOpsConsoleExecutionFacts(args: { teamId: string; runId: string; processId: PressAiProcessId; operationId: string; deadlineMs?: number }, overrides: Partial<ExportDependencies> = {}): Promise<OpsConsoleExecutionFactExportResult> {
  if (!UUID_PATTERN.test(args.operationId)) return { status: "failed", code: "OPS_CONSOLE_INVALID_OPERATION_ID", batches: 0, facts: 0 };
  const dependencies = { ...defaults, ...overrides };
  const startedAt = dependencies.now();
  const deadlineMs = args.deadlineMs ?? DEFAULT_DEADLINE_MS;
  try {
    const raw = await withinDeadline(dependencies.loadEvents({ teamId: args.teamId, runId: args.runId, limit: OPS_CONSOLE_MAX_CANONICAL_EVENTS + 1 }), deadlineMs);
    if (!raw) return { status: "failed", code: "OPS_CONSOLE_EXPORT_DEADLINE", batches: 0, facts: 0 };
    if (raw.length > OPS_CONSOLE_MAX_CANONICAL_EVENTS) return { status: "failed", code: "OPS_CONSOLE_CANONICAL_EVENT_LIMIT", batches: 0, facts: 0 };
    const events = raw.map(parseCanonicalAiTelemetryEvent) as CanonicalAiTelemetryEvent[];
    const facts = projectOpsConsoleExecutionFacts({ operationId: args.operationId, manifest: buildOpsConsoleWorkflowManifest(args.processId), events });
    if (!facts.length) return { status: "empty", batches: 0, facts: 0 };
    const batches = batchOpsConsoleExecutionFacts(facts);
    let delivered = 0;
    for (const batch of batches) {
      const remaining = deadlineMs - (dependencies.now() - startedAt);
      const result: OpsConsoleOperationResult | null = await withinDeadline(dependencies.appendFacts(batch), remaining);
      if (!result) return { status: "failed", code: "OPS_CONSOLE_EXPORT_DEADLINE", batches: delivered, facts: facts.length };
      if (result.status === "disabled" || result.status === "failed") return { status: result.status, code: result.code, batches: delivered, facts: facts.length };
      delivered += 1;
    }
    return { status: "exported", batches: delivered, facts: facts.length };
  } catch (error) {
    return { status: "failed", code: error instanceof Error && /^OPS_CONSOLE_[A-Z_]+$/.test(error.message) ? error.message : "OPS_CONSOLE_PROJECTION_FAILED", batches: 0, facts: 0 };
  }
}
