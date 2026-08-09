import { OPS_PRODUCER_SDK_VERSION, PRODUCER_PROTOCOL_VERSION } from "@nyxxir/ops-producer";

import { AI_TELEMETRY_EVENT_KINDS, CanonicalAiTelemetryEventSchema, type CanonicalAiTelemetryEvent } from "@/domain/ai-telemetry/contracts";
import { MAX_CANONICAL_EXPORT_EVENTS } from "@/domain/ai-telemetry/exportLimits";
import { projectCanonicalEventsToExecutionFactBatches } from "@/domain/ai-telemetry/opsProducerFactProjection";
import { buildPressAiWorkflowManifest } from "@/domain/press-ai-debugger/opsProducerManifest";
import { ProducerVerificationReportSchema, type ProducerVerificationReport } from "@/domain/press-ai-debugger/producerVerification";
import { getPressAiProcessDefinition, isPressAiProcessId } from "@/domain/press-ai-debugger/processRegistry";
import { getProcessRegistryHash } from "@/domain/press-ai-debugger/processRegistryHash";
import { prisma } from "@/lib/prisma";
import { CANONICAL_AI_TELEMETRY_EVENT_TYPE } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { prepareContentFreeOtlpProjection, readOtlpExporterConfiguration } from "@/lib/services/ai-telemetry/otlpExporter";
import { createOpsConsoleOperationClient } from "@/lib/services/operations/opsConsoleOperationClient";
import { readProcessOperationId } from "./processPersistence";

const LOCAL_PROJECTION_OPERATION_ID = "00000000-0000-4000-8000-000000000001";
const FAILURE_EVENT_TYPE = "OBSERVABILITY_DELIVERY_FAILED";
const emptyCanonicalCounts = () => Object.fromEntries(AI_TELEMETRY_EVENT_KINDS.map((kind) => [kind, 0])) as Record<(typeof AI_TELEMETRY_EVENT_KINDS)[number], number>;
const emptyFactCounts = () => ({ "node.lifecycle": 0, "edge.traversal": 0, "human.review": 0 });

type AttemptProjectionIdentity = {
  processId: string;
  processVersion: string;
  registryHash: string;
  runId: string;
  runInput: unknown;
};

export type ProducerVerificationServiceDependencies = {
  environment: Record<string, string | undefined>;
  loadAttempt: (scope: { teamId: string; attemptId: string }) => Promise<AttemptProjectionIdentity | null>;
  loadCanonicalRows: (scope: { teamId: string; runId: string }) => Promise<Array<{ details: unknown }>>;
  loadFailureRows: (scope: { teamId: string; runId: string }) => Promise<Array<{ details: unknown }>>;
};

const defaults: ProducerVerificationServiceDependencies = {
  environment: process.env,
  async loadAttempt({ teamId, attemptId }) {
    const attempt = await prisma.pressAiDebugAttempt.findFirst({
      where: { id: attemptId, teamId },
      select: { processId: true, processVersion: true, registryHash: true, agentRunId: true, agentRun: { select: { input: true } } },
    });
    return attempt ? { processId: attempt.processId, processVersion: attempt.processVersion, registryHash: attempt.registryHash, runId: attempt.agentRunId, runInput: attempt.agentRun.input } : null;
  },
  loadCanonicalRows: ({ teamId, runId }) => prisma.agentRuntimeAuditEvent.findMany({
    where: { teamId, runId, eventType: CANONICAL_AI_TELEMETRY_EVENT_TYPE },
    orderBy: [{ sequence: "asc" }, { occurredAt: "asc" }],
    take: MAX_CANONICAL_EXPORT_EVENTS + 1,
    select: { details: true },
  }),
  loadFailureRows: ({ teamId, runId }) => prisma.agentRuntimeAuditEvent.findMany({
    where: { teamId, runId, eventType: FAILURE_EVENT_TYPE },
    select: { details: true },
  }),
};

function notFound(): Error & { status: number; code: string } {
  return Object.assign(new Error("PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND"), { status: 404, code: "PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND" });
}

function knownFailurePhases(rows: Array<{ details: unknown }>): Set<string> {
  const phases = new Set<string>();
  for (const { details } of rows) {
    if (!details || typeof details !== "object" || Array.isArray(details)) continue;
    const phase = (details as Record<string, unknown>).phase;
    if (["BEGIN", "FACT", "EXPORT", "COMPLETE"].includes(String(phase))) phases.add(String(phase));
  }
  return phases;
}

export function createProducerVerificationService(overrides: Partial<ProducerVerificationServiceDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides };
  return async ({ teamId, attemptId }: { teamId: string; attemptId: string }): Promise<ProducerVerificationReport> => {
    const attempt = await dependencies.loadAttempt({ teamId, attemptId });
    if (!attempt || !isPressAiProcessId(attempt.processId)) throw notFound();
    const process = getPressAiProcessDefinition(attempt.processId);
    // Historical attempts remain projectable with their pinned workflow identity even
    // when the current registry has advanced; the report still exposes registry mismatch.
    const manifest = await buildPressAiWorkflowManifest(attempt.processId, { workflowVersion: attempt.processVersion });
    const [canonicalRows, failureRows] = await Promise.all([
      dependencies.loadCanonicalRows({ teamId, runId: attempt.runId }),
      dependencies.loadFailureRows({ teamId, runId: attempt.runId }),
    ]);
    const currentRegistryHash = getProcessRegistryHash(process);
    const registryMatches = attempt.registryHash === currentRegistryHash && attempt.processVersion === process.version;
    const operationConfiguration = createOpsConsoleOperationClient({ environment: dependencies.environment }).environment() ? "enabled" as const : "disabled" as const;
    const otlpConfiguration = readOtlpExporterConfiguration(dependencies.environment) ? "enabled" as const : "disabled" as const;
    const operationId = readProcessOperationId(attempt.runInput);
    const failures = knownFailurePhases(failureRows);
    const overLimit = canonicalRows.length > MAX_CANONICAL_EXPORT_EVENTS;
    const parsedEvents: CanonicalAiTelemetryEvent[] = [];
    let invalid = false;
    if (!overLimit) for (const row of canonicalRows) {
      const parsed = CanonicalAiTelemetryEventSchema.safeParse(row.details);
      if (!parsed.success || parsed.data.scope.teamId !== teamId || parsed.data.scope.runId !== attempt.runId || parsed.data.scope.attemptId !== attemptId || parsed.data.scope.processId !== attempt.processId || parsed.data.scope.processVersion !== attempt.processVersion) invalid = true;
      else parsedEvents.push(parsed.data);
    }
    if (invalid) parsedEvents.length = 0;
    const canonicalCounts = emptyCanonicalCounts();
    if (!invalid && !overLimit) for (const event of parsedEvents) canonicalCounts[event.eventKind] += 1;
    const canonicalStatus = overLimit ? "limit_exceeded" as const : invalid ? "invalid" as const : parsedEvents.length ? "observed" as const : "empty" as const;

    const factCounts = emptyFactCounts();
    let factsStatus: "ready" | "empty" | "invalid" | "limit_exceeded" = overLimit ? "limit_exceeded" : invalid ? "invalid" : "empty";
    let factCount = 0;
    let batchCount = 0;
    let uniqueFactCount = 0;
    let deterministicIds = false;
    let factsReplaySafe = false;
    let spanCount = 0;
    let requestCount = 0;
    let otlpStatus: "ready" | "empty" | "invalid" | "limit_exceeded" = overLimit ? "limit_exceeded" : invalid ? "invalid" : "empty";
    let contentFree = false;
    if (!overLimit && !invalid && parsedEvents.length) {
      try {
        const batches = projectCanonicalEventsToExecutionFactBatches({ operationId: operationId ?? LOCAL_PROJECTION_OPERATION_ID, manifest, events: parsedEvents });
        const facts = batches.flatMap((batch) => batch.facts);
        const replayFacts = projectCanonicalEventsToExecutionFactBatches({ operationId: operationId ?? LOCAL_PROJECTION_OPERATION_ID, manifest, events: parsedEvents }).flatMap((batch) => batch.facts);
        for (const fact of facts) factCounts[fact.kind] += 1;
        factCount = facts.length;
        batchCount = batches.length;
        uniqueFactCount = new Set(facts.map((fact) => fact.factId)).size;
        deterministicIds = uniqueFactCount === factCount && facts.every((fact, index) => fact.factId === replayFacts[index]?.factId);
        factsReplaySafe = deterministicIds;
        factsStatus = facts.length ? "ready" : "empty";
      } catch {
        factsStatus = "invalid";
      }
      try {
        const projection = prepareContentFreeOtlpProjection(parsedEvents);
        spanCount = projection.spanCount;
        requestCount = projection.requestCount;
        contentFree = projection.requests.every((request) => request.resourceSpans.every((resourceSpan) =>
          (resourceSpan.resource?.attributes ?? []).length === 0 && resourceSpan.scopeSpans.every((scopeSpan) =>
            scopeSpan.spans.every((span) => (span.attributes ?? []).length === 0 && !("events" in span) && !("links" in span)),
          ),
        ));
        otlpStatus = contentFree ? "ready" : "invalid";
      } catch {
        otlpStatus = "invalid";
      }
    }
    const replaySafe = canonicalStatus !== "invalid" && canonicalStatus !== "limit_exceeded" && factsReplaySafe && otlpStatus !== "invalid" && otlpStatus !== "limit_exceeded";
    const operationLinkage = operationId ? "linked" as const : failures.has("BEGIN") ? "failed" as const : operationConfiguration === "disabled" ? "disabled" as const : "not_observed" as const;
    const operationDelivery = (phase: "FACT" | "COMPLETE") => failures.has(phase) ? "failed" as const : operationConfiguration === "disabled" ? "disabled" as const : "not_observed" as const;
    const otlpDelivery = failures.has("EXPORT") ? "failed" as const : otlpConfiguration === "disabled" ? "disabled" as const : "not_observed" as const;
    const gateCount = new Set(manifest.stages.flatMap((stage) => stage.gateIds ?? [])).size;
    return ProducerVerificationReportSchema.parse({
      schemaVersion: "presstuner/producer-verification/v1",
      manifest: { status: registryMatches ? "verified" : "mismatch", protocolVersion: PRODUCER_PROTOCOL_VERSION, sdkVersion: OPS_PRODUCER_SDK_VERSION, workflowId: manifest.workflow.id, workflowVersion: manifest.workflow.version, definitionHash: manifest.definitionHash, storedRegistryHash: attempt.registryHash, registryMatches, stageCount: manifest.stages.length, edgeCount: manifest.edges.length, gateCount },
      canonical: { status: canonicalStatus, totalCount: canonicalRows.length, counts: canonicalCounts },
      facts: { status: factsStatus, factCount, batchCount, counts: factCounts, deterministicIds, replaySafe: factsReplaySafe },
      otlp: { status: otlpStatus, contentFree, spanCount, requestCount },
      delivery: { operationConfiguration, otlpConfiguration, operationLinkage, factDelivery: operationDelivery("FACT"), otlpDelivery, completionDelivery: operationDelivery("COMPLETE") },
      replay: { canonicalCount: parsedEvents.length, uniqueDeterministicFactCount: uniqueFactCount, aggregateSpanCount: spanCount, replaySafe },
    });
  };
}

export const getProducerVerification = createProducerVerificationService();
