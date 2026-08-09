import type { ExecutionFactBatch } from "@nyxxir/ops-producer";

import {
  parseCanonicalAiTelemetryEvent,
  type CanonicalAiTelemetryEvent,
} from "@/domain/ai-telemetry/contracts";
import { projectCanonicalEventsToExecutionFactBatches } from "@/domain/ai-telemetry/opsProducerFactProjection";
import { buildPressAiWorkflowManifest } from "@/domain/press-ai-debugger/opsProducerManifest";
import type { PressAiProcessId } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import { CANONICAL_AI_TELEMETRY_EVENT_TYPE } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { CANONICAL_EVENT_LIMIT_EXCEEDED, MAX_CANONICAL_EXPORT_EVENTS } from "@/domain/ai-telemetry/exportLimits";
import {
  appendOpsConsoleExecutionFacts,
  type OpsConsoleOperationResult,
} from "./opsConsoleOperationClient";

type ExportDependencies = {
  loadEvents: (scope: { teamId: string; runId: string }) => Promise<CanonicalAiTelemetryEvent[]>;
  appendBatch: (args: { batch: ExecutionFactBatch }) => Promise<OpsConsoleOperationResult>;
};

const defaults: ExportDependencies = {
  async loadEvents(scope) {
    const rows = await prisma.agentRuntimeAuditEvent.findMany({
      where: {
        teamId: scope.teamId,
        runId: scope.runId,
        eventType: CANONICAL_AI_TELEMETRY_EVENT_TYPE,
      },
      orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }],
      take: MAX_CANONICAL_EXPORT_EVENTS + 1,
      select: { details: true },
    });
    return rows.map(({ details }) => parseCanonicalAiTelemetryEvent(details));
  },
  appendBatch: appendOpsConsoleExecutionFacts,
};

export async function exportRunExecutionFacts(
  args: {
    teamId: string;
    runId: string;
    processId: PressAiProcessId;
    operationId: string;
  },
  overrides: Partial<ExportDependencies> = {},
): Promise<
  | { status: "exported"; operationId: string; factCount: number; batchCount: number }
  | { status: "failed"; operationId: string; code: string }
> {
  const dependencies = { ...defaults, ...overrides };
  try {
    const [manifest, events] = await Promise.all([
      buildPressAiWorkflowManifest(args.processId),
      dependencies.loadEvents({ teamId: args.teamId, runId: args.runId }),
    ]);
    if (events.length > MAX_CANONICAL_EXPORT_EVENTS) {
      return { status: "failed", code: CANONICAL_EVENT_LIMIT_EXCEEDED, operationId: args.operationId };
    }
    const batches = projectCanonicalEventsToExecutionFactBatches({
      operationId: args.operationId,
      manifest,
      events,
    });
    let factCount = 0;
    for (const batch of batches) {
      const result = await dependencies.appendBatch({ batch });
      if (result.status === "failed" || result.status === "disabled") {
        return { status: "failed", code: result.code, operationId: args.operationId };
      }
      factCount += batch.facts.length;
    }
    return {
      status: "exported",
      operationId: args.operationId,
      factCount,
      batchCount: batches.length,
    };
  } catch {
    return {
      status: "failed",
      code: "OPS_PRODUCER_FACT_PROJECTION_FAILED",
      operationId: args.operationId,
    };
  }
}