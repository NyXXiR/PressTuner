import { Prisma } from "@prisma/client";

import { classifyAgentFailure } from "@/domain/evaluation/failureTaxonomy";
import { prisma } from "@/lib/prisma";

const FORBIDDEN_DETAIL_KEYS = /prompt|secret|token|checkpoint|sourceExcerpt|sdkState/i;

export function sanitizeAgentAuditDetails(details: Record<string, unknown>) {
  const sanitize = (value: unknown): unknown => {
    if (typeof value === "string") return value.slice(0, 500);
    if (Array.isArray(value)) return value.slice(0, 100).map(sanitize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !FORBIDDEN_DETAIL_KEYS.test(key))
          .map(([key, child]) => [key, sanitize(child)]),
      );
    }
    return value;
  };
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => !FORBIDDEN_DETAIL_KEYS.test(key))
      .map(([key, value]) => [key, sanitize(value)]),
  );
}

export async function recordAgentAuditEvent(args: {
  teamId: string;
  runId?: string;
  eventType: string;
  error?: unknown;
  details?: Record<string, unknown>;
}) {
  return prisma.agentRuntimeAuditEvent.create({
    data: {
      teamId: args.teamId,
      runId: args.runId,
      eventType: args.eventType,
      failureCategory: args.error ? classifyAgentFailure(args.error) : null,
      details: sanitizeAgentAuditDetails(args.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}
