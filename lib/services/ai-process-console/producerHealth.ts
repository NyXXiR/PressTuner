import { AI_PROCESS_CONSOLE_SOURCE } from "@/domain/ai-process-console/v1/publication";
import { prisma } from "@/lib/prisma";
import type { AiProcessConsoleAdapterConfiguration, ConfigurationCode } from "./adapterConfiguration.server";
import { summarizeAiProcessConsoleAdapterConfiguration } from "./adapterConfiguration.server";

export const AI_PROCESS_PRODUCER_HEALTH_SCHEMA_VERSION = "presstuner-ai-process-producer-health/v1" as const;
export type ProducerReadiness = "READY" | "DEGRADED" | "NOT_READY";
export type HealthReasonCode = "ADAPTER_DISABLED" | "CONFIGURATION_INVALID" | "HEALTH_QUERY_FAILED" | "DEAD_LETTER_PRESENT" | "PENDING_BACKLOG_STALE";

export type AiProcessProducerHealth = Readonly<{
  schemaVersion: typeof AI_PROCESS_PRODUCER_HEALTH_SCHEMA_VERSION;
  readiness: ProducerReadiness;
  configuration: Readonly<{ valid: boolean; code: ConfigurationCode }>;
  pendingCount: number | null;
  deadLetterCount: number | null;
  oldestPendingAgeSeconds: number | null;
  lastSuccessfulDeliveryAt: string | null;
  reasonCodes: HealthReasonCode[];
}>;

export type ProducerHealthEvidence = Readonly<{
  pendingCount: number;
  deadLetterCount: number;
  oldestPendingCreatedAt: Date | null;
  lastSuccessfulDeliveryAt: Date | null;
}>;

type ProducerHealthDatabase = Readonly<{
  aiProcessFactOutbox: Readonly<{
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<{ createdAt: Date } | null>;
  }>;
  aiProcessProducerDeliveryWatermark: Readonly<{
    findUnique: (args: unknown) => Promise<{ lastSuccessfulDeliveryAt: Date } | null>;
  }>;
}>;

const base = (configuration: AiProcessConsoleAdapterConfiguration) => ({
  schemaVersion: AI_PROCESS_PRODUCER_HEALTH_SCHEMA_VERSION,
  configuration: summarizeAiProcessConsoleAdapterConfiguration(configuration),
});

export function classifyAiProcessProducerHealth(args: {
  configuration: AiProcessConsoleAdapterConfiguration;
  evidence?: ProducerHealthEvidence;
  queryFailed?: boolean;
  now?: Date;
}): AiProcessProducerHealth {
  if (args.configuration.status === "DISABLED") return { ...base(args.configuration), readiness: "NOT_READY", pendingCount: null, deadLetterCount: null, oldestPendingAgeSeconds: null, lastSuccessfulDeliveryAt: null, reasonCodes: ["ADAPTER_DISABLED"] };
  if (args.configuration.status === "INVALID") return { ...base(args.configuration), readiness: "NOT_READY", pendingCount: null, deadLetterCount: null, oldestPendingAgeSeconds: null, lastSuccessfulDeliveryAt: null, reasonCodes: ["CONFIGURATION_INVALID"] };
  if (args.queryFailed || !args.evidence) return { ...base(args.configuration), readiness: "NOT_READY", pendingCount: null, deadLetterCount: null, oldestPendingAgeSeconds: null, lastSuccessfulDeliveryAt: null, reasonCodes: ["HEALTH_QUERY_FAILED"] };

  const now = args.now ?? new Date();
  const oldestPendingAgeSeconds = args.evidence.oldestPendingCreatedAt === null
    ? null
    : Math.max(0, Math.floor((now.getTime() - args.evidence.oldestPendingCreatedAt.getTime()) / 1000));
  const reasonCodes: HealthReasonCode[] = [];
  if (args.evidence.deadLetterCount > 0) reasonCodes.push("DEAD_LETTER_PRESENT");
  if (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds > args.configuration.settings.pendingDegradedAfterSeconds) reasonCodes.push("PENDING_BACKLOG_STALE");
  return {
    ...base(args.configuration),
    readiness: reasonCodes.length > 0 ? "DEGRADED" : "READY",
    pendingCount: args.evidence.pendingCount,
    deadLetterCount: args.evidence.deadLetterCount,
    oldestPendingAgeSeconds,
    lastSuccessfulDeliveryAt: args.evidence.lastSuccessfulDeliveryAt?.toISOString() ?? null,
    reasonCodes,
  };
}

export async function readAiProcessProducerHealth(args: {
  configuration: AiProcessConsoleAdapterConfiguration;
  database?: ProducerHealthDatabase;
  now?: Date;
}): Promise<AiProcessProducerHealth> {
  if (args.configuration.status !== "VALID") return classifyAiProcessProducerHealth({ configuration: args.configuration, now: args.now });
  const database = args.database ?? (prisma as unknown as ProducerHealthDatabase);
  try {
    const [pendingCount, deadLetterCount, oldestPending, watermark] = await Promise.all([
      database.aiProcessFactOutbox.count({ where: { source: AI_PROCESS_CONSOLE_SOURCE, deliveryState: "PENDING" } }),
      database.aiProcessFactOutbox.count({ where: { source: AI_PROCESS_CONSOLE_SOURCE, deliveryState: "DEAD_LETTER" } }),
      database.aiProcessFactOutbox.findFirst({ where: { source: AI_PROCESS_CONSOLE_SOURCE, deliveryState: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { createdAt: true } }),
      database.aiProcessProducerDeliveryWatermark.findUnique({ where: { source: AI_PROCESS_CONSOLE_SOURCE }, select: { lastSuccessfulDeliveryAt: true } }),
    ]);
    return classifyAiProcessProducerHealth({ configuration: args.configuration, now: args.now, evidence: { pendingCount, deadLetterCount, oldestPendingCreatedAt: oldestPending?.createdAt ?? null, lastSuccessfulDeliveryAt: watermark?.lastSuccessfulDeliveryAt ?? null } });
  } catch {
    return classifyAiProcessProducerHealth({ configuration: args.configuration, now: args.now, queryFailed: true });
  }
}
