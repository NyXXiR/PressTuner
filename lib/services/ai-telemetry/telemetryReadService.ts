import { CanonicalAiTelemetryEventSchema } from "@/domain/ai-telemetry/contracts";
import { projectCanonicalEventToOpsConsole } from "@/domain/ai-telemetry/opsConsoleProjection";
import { prisma } from "@/lib/prisma";
import { CANONICAL_AI_TELEMETRY_EVENT_TYPE } from "./canonicalEventStore";

export async function readCanonicalRunTelemetry(args: { teamId: string; runId: string; limit?: number; afterSequence?: number }) {
  const limit = Math.max(1, Math.min(200, Math.trunc(args.limit ?? 100)));
  const rows = await prisma.agentRuntimeAuditEvent.findMany({
    where: { teamId: args.teamId, runId: args.runId, eventType: CANONICAL_AI_TELEMETRY_EVENT_TYPE, sequence: args.afterSequence === undefined ? { not: null } : { gt: Math.max(0, Math.trunc(args.afterSequence)) } },
    orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }], take: limit + 1, select: { details: true },
  });
  const malformed: number[] = [];
  const events = rows.slice(0, limit).flatMap((row, index) => {
    const parsed = CanonicalAiTelemetryEventSchema.safeParse(row.details);
    if (!parsed.success) { malformed.push(index); return []; }
    return [projectCanonicalEventToOpsConsole(parsed.data)];
  });
  const last = events.at(-1);
  const summaries = {
    runs: events.filter(({ eventKind }) => eventKind === "run.lifecycle"),
    spans: events.filter(({ eventKind }) => eventKind === "span.lifecycle"),
    evaluations: events.filter(({ eventKind }) => eventKind === "transition.evaluation"),
    approvals: events.filter(({ eventKind }) => eventKind === "human.approval"),
    experiments: events.filter(({ eventKind }) => eventKind === "experiment.outcome" || eventKind === "regression.outcome"),
  };
  return { runId: args.runId, summaries, events, malformedRows: malformed.length, nextSequence: rows.length > limit && last ? last.sequence : null };
}
