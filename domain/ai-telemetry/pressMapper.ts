import type { PressAiProcessEvent } from "@/domain/press-ai-debugger/processEvents";
import { getProcessRegistryHash } from "@/domain/press-ai-debugger/processRegistryHash";
import { getPressAiProcessDefinition } from "@/domain/press-ai-debugger/processRegistry";
import { AI_TELEMETRY_SCHEMA_VERSION, parseCanonicalAiTelemetryEvent, type CanonicalAiTelemetryEvent, type CanonicalAiTelemetryEventInput } from "./contracts";
import { deriveCanonicalEventId, deriveCanonicalSpanId, normalizeCanonicalTraceId, pseudonymousActorReference } from "./identifiers";
import { internalEvidence } from "./privacy";

export type PressTelemetryContext = {
  teamId: string; runId: string; traceId?: string | null; attemptId: string;
  parentAttemptId?: string | null; caseId?: string | null; processId?: string;
  processVersion?: string; registryHash?: string; executionMode?: "LIVE" | "REPLAY" | "DETERMINISTIC";
  occurredAt?: string;
};

function base(context: PressTelemetryContext, source: readonly (string | number | null | undefined)[], spanKey: string, parentSpanKey?: string | null) {
  const process = getPressAiProcessDefinition((context.processId ?? "press-creation") as "press-creation" | "rag-query");
  const traceId = normalizeCanonicalTraceId(context.traceId, context.teamId, context.runId, context.attemptId);
  return {
    schemaVersion: AI_TELEMETRY_SCHEMA_VERSION,
    eventId: deriveCanonicalEventId(context.teamId, context.attemptId, ...source), traceId,
    spanId: deriveCanonicalSpanId(traceId, spanKey), parentSpanId: parentSpanKey ? deriveCanonicalSpanId(traceId, parentSpanKey) : null,
    sequence: 1, occurredAt: context.occurredAt ?? new Date().toISOString(),
    scope: { teamId: context.teamId, runId: context.runId, processId: context.processId ?? process.id, processVersion: context.processVersion ?? process.version, registryHash: context.registryHash ?? getProcessRegistryHash(process), attemptId: context.attemptId, parentAttemptId: context.parentAttemptId ?? null, caseId: context.caseId ?? null },
    executionMode: context.executionMode ?? "LIVE", attributes: {},
  };
}

export function mapRunLifecycle(context: PressTelemetryContext, phase: "STARTED" | "COMPLETED" | "FAILED" | "BLOCKED" | "CANCELLED", reasonCode: string | null = null) {
  return parseCanonicalAiTelemetryEvent({ ...base(context, ["run", phase], "run"), eventKind: "run.lifecycle", status: phase, payload: { phase, reasonCode } });
}

export function mapNodeLifecycle(context: PressTelemetryContext, args: { nodeId: string; commandId: string; phase: "STARTED" | "COMPLETED" | "FAILED"; reasonCode?: string | null }) {
  return parseCanonicalAiTelemetryEvent({ ...base(context, ["node", args.commandId, args.nodeId, args.phase], `node:${args.nodeId}`, "run"), eventKind: "span.lifecycle", status: args.phase, attributes: { "domain.node.id": args.nodeId, "domain.command.id_hash": deriveCanonicalEventId(args.commandId) }, payload: { phase: args.phase, spanKind: "CHAIN", operationName: args.nodeId, nodeId: args.nodeId, reasonCode: args.reasonCode ?? null } });
}

export function mapTransitionEvaluation(context: PressTelemetryContext, args: { transitionId: string; edgeId: string; sourceNodeId: string; evaluator: { id: string; version: string }; verdict: "PASS" | "WARN" | "BLOCK" | "NOT_EVALUABLE"; expected?: unknown; observed?: unknown; reasonCode?: string; evidence?: unknown }) {
  const checkedEvidence = args.evidence && typeof args.evidence === "object" && Array.isArray((args.evidence as { checked?: unknown[] }).checked) ? (args.evidence as { checked: unknown[] }).checked : null;
  const values = Array.isArray(args.evidence) ? args.evidence : checkedEvidence ?? [args.expected, args.observed].filter((value) => value !== undefined);
  const evidence = values.slice(0, 32).map((value, index) => {
    if (value && typeof value === "object" && "sourceField" in value && "factKind" in value && "factValue" in value && "matchStatus" in value) return internalEvidence(value as Parameters<typeof internalEvidence>[0]);
    return internalEvidence({ sourceField: index === 0 ? "expected" : "observed", factKind: "TEXT", factValue: value, matchStatus: args.verdict === "PASS" ? "MATCHED" : "MISSING", reasonCode: args.reasonCode ?? "GUARDRAIL_RESULT" });
  });
  const scoreValue = args.verdict === "PASS" ? 1 : args.verdict === "WARN" ? 0.5 : 0;
  return parseCanonicalAiTelemetryEvent({ ...base(context, ["transition", args.transitionId, args.edgeId, args.evaluator.id], `evaluation:${args.transitionId}:${args.evaluator.id}`, `node:${args.sourceNodeId}`), eventKind: "transition.evaluation", status: args.verdict, attributes: { "domain.edge.id": args.edgeId, "domain.node.id": args.sourceNodeId }, payload: { edgeId: args.edgeId, evaluator: args.evaluator, score: { value: scoreValue, label: args.verdict }, verdict: args.verdict, evidence, evidenceOverflow: Math.max(0, values.length - evidence.length), reasonCode: args.reasonCode ?? "GUARDRAIL_RESULT" } });
}

export function mapHumanApproval(context: PressTelemetryContext, args: { sourceId: string; edgeId?: string; gateId: string; phase: "REQUESTED" | "RECORDED"; decision: "PENDING" | "APPROVED" | "REJECTED" | "ACKNOWLEDGED"; actorId?: string | null }) {
  return parseCanonicalAiTelemetryEvent({ ...base(context, ["approval", args.sourceId, args.gateId, args.phase], `approval:${args.sourceId}:${args.gateId}`, "run"), eventKind: "human.approval", status: args.phase === "REQUESTED" ? "WAITING" : "RECORDED", attributes: args.edgeId ? { "domain.edge.id": args.edgeId } : {}, payload: { gateId: args.gateId, phase: args.phase, decision: args.decision, actorRef: args.actorId ? pseudonymousActorReference(args.actorId) : null } });
}

export function mapEdgeTraversed(context: PressTelemetryContext, args: { transitionId: string; edgeId: string; sourceNodeId: string; targetNodeId: string; verdict: "PASS" | "WARN"; acknowledged: boolean }) {
  return parseCanonicalAiTelemetryEvent({ ...base(context, ["edge", args.transitionId, args.edgeId], `edge:${args.transitionId}:${args.edgeId}`, `node:${args.sourceNodeId}`), eventKind: "edge.traversed", status: "COMPLETED", attributes: { "domain.edge.id": args.edgeId, "domain.node.source": args.sourceNodeId, "domain.node.target": args.targetNodeId }, payload: { edgeId: args.edgeId, sourceNodeId: args.sourceNodeId, targetNodeId: args.targetNodeId, verdict: args.verdict, acknowledged: args.acknowledged } });
}

export function mapDatasetItemCaptured(context: PressTelemetryContext, args: { caseId: string; checkpointId: string; captureKind: string }) {
  return parseCanonicalAiTelemetryEvent({ ...base({ ...context, caseId: args.caseId }, ["dataset", args.checkpointId, args.captureKind], `dataset:${args.caseId}`, "run"), eventKind: "dataset.item.captured", status: "RECORDED", payload: { datasetId: context.processId ?? "press-creation", datasetVersion: context.processVersion ?? "unknown", itemId: args.caseId, captureKind: args.captureKind } });
}

export function mapReplayStarted(context: PressTelemetryContext, args: { sourceAttemptId: string; restoredCheckpointId?: string | null; caseId?: string | null }) {
  return parseCanonicalAiTelemetryEvent({ ...base({ ...context, executionMode: "REPLAY" }, ["replay", args.sourceAttemptId, args.restoredCheckpointId], "run"), eventKind: "replay.started", status: "STARTED", payload: { sourceAttemptId: args.sourceAttemptId, restoredCheckpointId: args.restoredCheckpointId ?? null, caseId: args.caseId ?? null } });
}

export function mapExperimentOutcomes(context: PressTelemetryContext, args: { sourceId: string; datasetId: string; datasetVersion: string; baselineConfigurationId: string; candidateConfigurationId: string; disposition: "PROMOTE" | "REJECT" | "NOT_EVALUABLE"; checks: readonly { metricId: string; status: "PASS" | "FAIL" | "NOT_EVALUABLE"; candidate?: number | null; reason: string }[] }) {
  const checks = args.checks.slice(0, 32).map((item) => ({ id: item.metricId, status: item.status, value: item.candidate ?? null, reasonCode: item.reason.replaceAll(" ", "_").toUpperCase().slice(0, 100) }));
  const status = args.disposition === "PROMOTE" ? "PASS" : args.disposition === "REJECT" ? "FAILED" : "NOT_EVALUABLE";
  const experiment = parseCanonicalAiTelemetryEvent({ ...base(context, ["experiment", args.sourceId], `experiment:${args.sourceId}`, "run"), eventKind: "experiment.outcome", status, payload: { datasetId: args.datasetId, datasetVersion: args.datasetVersion, configurationId: args.candidateConfigurationId, disposition: args.disposition, checks } });
  const regression = parseCanonicalAiTelemetryEvent({ ...base(context, ["regression", args.sourceId], `regression:${args.sourceId}`, "run"), eventKind: "regression.outcome", status, payload: { datasetId: args.datasetId, datasetVersion: args.datasetVersion, baselineConfigurationId: args.baselineConfigurationId, candidateConfigurationId: args.candidateConfigurationId, disposition: args.disposition, checks } });
  return { experiment, regression };
}

export function mapPressProcessEvent(context: PressTelemetryContext, event: PressAiProcessEvent): CanonicalAiTelemetryEvent | null {
  const scoped = { ...context, processId: event.processId, processVersion: event.processVersion, occurredAt: event.occurredAt };
  if (event.type === "run.started") return mapRunLifecycle(scoped, "STARTED");
  if (event.type === "run.finished") return mapRunLifecycle(scoped, event.run.status === "succeeded" || event.run.status === "warning" ? "COMPLETED" : event.run.status === "blocked" ? "BLOCKED" : event.run.status === "cancelled" ? "CANCELLED" : "FAILED", event.run.findingCode);
  if (event.type === "run.waiting-input") return mapHumanApproval(scoped, { sourceId: event.eventId, gateId: event.gate.id, phase: "REQUESTED", decision: "PENDING" });
  if (event.type === "human.reviewed") return mapHumanApproval(scoped, { sourceId: event.eventId, gateId: event.gate.id, phase: "RECORDED", decision: event.review.decision });
  if (event.type === "node.state") return mapNodeLifecycle(scoped, { nodeId: event.node.id, commandId: event.eventId, phase: event.node.state === "running" ? "STARTED" : event.node.state === "failed" || event.node.state === "blocked" ? "FAILED" : "COMPLETED", reasonCode: event.node.findingCode });
  if (event.edge.state !== "taken" && event.edge.state !== "taken-with-violation") return null;
  return mapEdgeTraversed(scoped, { transitionId: event.eventId, edgeId: event.edge.id, sourceNodeId: event.edge.source, targetNodeId: event.edge.target, verdict: event.edge.state === "taken-with-violation" ? "WARN" : "PASS", acknowledged: event.edge.state === "taken-with-violation" });
}

export function withCanonicalSequence(event: CanonicalAiTelemetryEventInput, sequence: number) {
  return parseCanonicalAiTelemetryEvent({ ...event, sequence });
}
