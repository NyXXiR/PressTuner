import type { CanonicalAiTelemetryEvent } from "./contracts";

export type OtlpAnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OtlpAnyValue[] } }
  | { kvlistValue: { values: OtlpKeyValue[] } };

export type OtlpKeyValue = { key: string; value: OtlpAnyValue };

export type OtlpStatus = { code: 0 | 1 | 2; message?: string };

export type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceState?: string;
  name: string;
  kind: 0 | 1 | 2 | 3 | 4 | 5;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  droppedAttributesCount?: number;
  events: OtlpSpanEvent[];
  droppedEventsCount?: number;
  links: OtlpLink[];
  droppedLinksCount?: number;
  status: OtlpStatus;
};

export type OtlpSpanEvent = {
  timeUnixNano: string;
  name: string;
  attributes: OtlpKeyValue[];
  droppedAttributesCount?: number;
};

export type OtlpLink = {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: OtlpKeyValue[];
  droppedAttributesCount?: number;
};

export type OtlpScope = { name: string; version?: string; attributes?: OtlpKeyValue[] };

export type OtlpScopeSpans = { scope: OtlpScope; spans: OtlpSpan[] };

export type OtlpResource = { attributes: OtlpKeyValue[]; droppedAttributesCount?: number };

export type OtlpResourceSpans = { resource: OtlpResource; scopeSpans: OtlpScopeSpans[] };

export type OtlpTraceRequest = { resourceSpans: OtlpResourceSpans[] };

function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

function toUnixNano(iso: string): string {
  return String(BigInt(new Date(iso).getTime()) * BigInt(1_000_000));
}

function toAnyValue(value: unknown): OtlpAnyValue {
  if (value === null || value === undefined) return { stringValue: "" };
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") return { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toAnyValue) } };
  if (typeof value === "object") {
    return { kvlistValue: { values: Object.entries(value as Record<string, unknown>).map(([key, val]) => ({ key, value: toAnyValue(val) })) } };
  }
  return { stringValue: String(value) };
}

function flattenObject(obj: Record<string, unknown>, prefix = "", result: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value as Record<string, unknown>, fullKey, result);
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

const SAFE_EVENT_ATTRIBUTE_KEYS: Record<CanonicalAiTelemetryEvent["eventKind"], readonly string[]> = {
  "run.lifecycle": [],
  "span.lifecycle": ["domain.node.id"],
  "transition.evaluation": ["domain.edge.id", "domain.node.id"],
  "human.approval": ["domain.edge.id"],
  "edge.traversed": ["domain.edge.id", "domain.node.source", "domain.node.target"],
  "dataset.item.captured": [],
  "replay.started": [],
  "experiment.outcome": [],
  "regression.outcome": [],
};

function safeEventAttributes(event: CanonicalAiTelemetryEvent): Record<string, unknown> {
  return Object.fromEntries(SAFE_EVENT_ATTRIBUTE_KEYS[event.eventKind].flatMap((key) => key in event.attributes ? [[key, event.attributes[key]]] : []));
}

/**
 * OTLP is an operational index, not a second evidence store. Keep this switch
 * exhaustive so new canonical payload fields remain private until reviewed.
 */
function safePayload(event: CanonicalAiTelemetryEvent): Record<string, unknown> {
  switch (event.eventKind) {
    case "run.lifecycle":
      return { phase: event.payload.phase, reasonCode: event.payload.reasonCode };
    case "span.lifecycle":
      return { phase: event.payload.phase, spanKind: event.payload.spanKind, operationName: event.payload.operationName, nodeId: event.payload.nodeId, reasonCode: event.payload.reasonCode };
    case "transition.evaluation":
      return { edgeId: event.payload.edgeId, evaluator: event.payload.evaluator, score: event.payload.score, verdict: event.payload.verdict, evidenceOverflow: event.payload.evidenceOverflow, reasonCode: event.payload.reasonCode };
    case "human.approval":
      return { gateId: event.payload.gateId, phase: event.payload.phase, decision: event.payload.decision };
    case "edge.traversed":
      return { edgeId: event.payload.edgeId, sourceNodeId: event.payload.sourceNodeId, targetNodeId: event.payload.targetNodeId, verdict: event.payload.verdict, acknowledged: event.payload.acknowledged };
    case "dataset.item.captured":
      return { datasetId: event.payload.datasetId, datasetVersion: event.payload.datasetVersion, captureKind: event.payload.captureKind };
    case "replay.started":
      return {};
    case "experiment.outcome":
      return { datasetId: event.payload.datasetId, datasetVersion: event.payload.datasetVersion, configurationId: event.payload.configurationId, disposition: event.payload.disposition, checks: event.payload.checks };
    case "regression.outcome":
      return { datasetId: event.payload.datasetId, datasetVersion: event.payload.datasetVersion, baselineConfigurationId: event.payload.baselineConfigurationId, candidateConfigurationId: event.payload.candidateConfigurationId, disposition: event.payload.disposition, checks: event.payload.checks };
  }
}

function mapSpanKind(eventKind: CanonicalAiTelemetryEvent["eventKind"], payload: CanonicalAiTelemetryEvent["payload"]): OtlpSpan["kind"] {
  if (eventKind === "run.lifecycle") return 1; // INTERNAL
  if (eventKind === "span.lifecycle") {
    const spanKind = (payload as { spanKind?: string }).spanKind;
    if (spanKind === "AGENT") return 1;
    if (spanKind === "CHAIN") return 1;
    if (spanKind === "TOOL") return 4; // PRODUCER
    if (spanKind === "GUARDRAIL") return 1;
    if (spanKind === "EVALUATOR") return 1;
  }
  return 1; // INTERNAL
}

function mapStatus(status: CanonicalAiTelemetryEvent["status"]): OtlpStatus {
  if (["COMPLETED", "PASS", "STARTED", "RUNNING", "WAITING", "RECORDED"].includes(status)) return { code: 1 };
  if (["FAILED", "BLOCK", "BLOCKED", "CANCELLED"].includes(status)) return { code: 2, message: status };
  return { code: 0 };
}

export function projectCanonicalEventToOtlpSpan(event: CanonicalAiTelemetryEvent): OtlpSpan {
  const flattenedPayload = flattenObject(safePayload(event));
  const attributes: OtlpKeyValue[] = [
    { key: "ai.telemetry.schema_version", value: { stringValue: event.schemaVersion } },
    { key: "ai.telemetry.event_kind", value: { stringValue: event.eventKind } },
    { key: "ai.telemetry.sequence", value: { intValue: String(event.sequence) } },
    { key: "ai.telemetry.execution_mode", value: { stringValue: event.executionMode } },
    { key: "service.process_id", value: { stringValue: event.scope.processId } },
    { key: "service.process_version", value: { stringValue: event.scope.processVersion } },
    { key: "service.registry_hash", value: { stringValue: event.scope.registryHash } },
    ...Object.entries(safeEventAttributes(event)).map(([key, value]) => ({ key, value: toAnyValue(value) })),
    ...Object.entries(flattenedPayload).map(([key, value]) => ({ key: `ai.telemetry.payload.${key}`, value: toAnyValue(value) })),
  ];

  return {
    traceId: hexToBase64(event.traceId),
    spanId: hexToBase64(event.spanId),
    ...(event.parentSpanId ? { parentSpanId: hexToBase64(event.parentSpanId) } : {}),
    name: event.eventKind,
    kind: mapSpanKind(event.eventKind, event.payload),
    startTimeUnixNano: toUnixNano(event.occurredAt),
    endTimeUnixNano: toUnixNano(event.occurredAt),
    attributes,
    events: [],
    links: [],
    status: mapStatus(event.status),
  };
}

export function buildOtlpTraceRequest(events: CanonicalAiTelemetryEvent[]): OtlpTraceRequest {
  const spans = events.map(projectCanonicalEventToOtlpSpan);
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "press-tuner" } },
            { key: "service.namespace", value: { stringValue: "briefflow" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "press-tuner-canonical-telemetry", version: "1.0.0" },
            spans,
          },
        ],
      },
    ],
  };
}
