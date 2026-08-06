import type { CanonicalAiTelemetryEvent } from "./contracts";
import { safeEvidenceSummary } from "./privacy";

export function projectCanonicalEventToOpenInference(event: CanonicalAiTelemetryEvent) {
  const attributes: Record<string, string | number | boolean> = {
    "openinference.span.kind": event.eventKind === "transition.evaluation" ? "EVALUATOR" : event.eventKind === "human.approval" ? "GUARDRAIL" : event.eventKind === "run.lifecycle" ? "AGENT" : "CHAIN",
    "gen_ai.operation.name": event.eventKind,
    "ai.telemetry.schema_version": event.schemaVersion,
    "ai.telemetry.event_id": event.eventId,
  };
  if (event.eventKind === "transition.evaluation") {
    attributes["gen_ai.evaluation.name"] = event.payload.evaluator.id;
    attributes["gen_ai.evaluation.score.value"] = event.payload.score.value;
    attributes["gen_ai.evaluation.score.label"] = event.payload.score.label;
    attributes["ai.telemetry.evidence.count"] = event.payload.evidence.length;
  }
  return { traceId: event.traceId, spanId: event.spanId, parentSpanId: event.parentSpanId, name: event.eventKind, startTime: event.occurredAt, status: event.status, attributes, evidence: safeEvidenceSummary(event) };
}
