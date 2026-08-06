import type { CanonicalAiTelemetryEvent } from "./contracts";
import { safeEvidenceSummary } from "./privacy";

export const CANONICAL_TELEMETRY_PRODUCER_ID = "press-tuner-canonical-ai-telemetry";

export function projectCanonicalEventToOpsConsole(event: CanonicalAiTelemetryEvent) {
  const payload = event.eventKind === "transition.evaluation"
    ? { edgeId: event.payload.edgeId, evaluator: event.payload.evaluator, score: event.payload.score, verdict: event.payload.verdict, reasonCode: event.payload.reasonCode, evidence: safeEvidenceSummary(event), evidenceOverflow: event.payload.evidenceOverflow }
    : event.eventKind === "span.lifecycle"
      ? { phase: event.payload.phase, spanKind: event.payload.spanKind, operationName: event.payload.operationName, nodeId: event.payload.nodeId, reasonCode: event.payload.reasonCode }
      : event.eventKind === "edge.traversed" ? event.payload
        : event.eventKind === "human.approval" ? event.payload
          : event.eventKind === "run.lifecycle" ? event.payload
            : { disposition: "disposition" in event.payload ? event.payload.disposition : undefined };
  return { producerId: CANONICAL_TELEMETRY_PRODUCER_ID, schemaVersion: event.schemaVersion, eventId: event.eventId, eventKind: event.eventKind, traceId: event.traceId, spanId: event.spanId, parentSpanId: event.parentSpanId, sequence: event.sequence, occurredAt: event.occurredAt, status: event.status, attributes: event.attributes, payload };
}
