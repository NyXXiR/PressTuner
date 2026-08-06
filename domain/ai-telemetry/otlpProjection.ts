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
  const flattenedPayload = flattenObject(event.payload as Record<string, unknown>);
  const attributes: OtlpKeyValue[] = [
    { key: "ai.telemetry.schema_version", value: { stringValue: event.schemaVersion } },
    { key: "ai.telemetry.event_id", value: { stringValue: event.eventId } },
    { key: "ai.telemetry.event_kind", value: { stringValue: event.eventKind } },
    { key: "ai.telemetry.sequence", value: { intValue: String(event.sequence) } },
    { key: "ai.telemetry.execution_mode", value: { stringValue: event.executionMode } },
    { key: "service.process_id", value: { stringValue: event.scope.processId } },
    { key: "service.process_version", value: { stringValue: event.scope.processVersion } },
    { key: "service.registry_hash", value: { stringValue: event.scope.registryHash } },
    { key: "service.attempt_id", value: { stringValue: event.scope.attemptId } },
    ...Object.entries(event.attributes).map(([key, value]) => ({ key, value: toAnyValue(value) })),
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
