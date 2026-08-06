import { createHash } from "node:crypto";
import type { CanonicalAiTelemetryEvent } from "./contracts";

export const TELEMETRY_EVIDENCE_LIMIT = 32;
export const TELEMETRY_FACT_LENGTH = 240;

export function hashTelemetryValue(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function boundTelemetryText(value: unknown, maximum = TELEMETRY_FACT_LENGTH) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 1))}…`;
}

export function internalEvidence(args: { sourceField: string; factKind: "NUMBER" | "DATE" | "QUOTE" | "CONSTRAINT" | "TEXT"; factValue: unknown; matchStatus: "MATCHED" | "MISSING" | "EXCLUDED"; reasonCode: string }) {
  const factValue = boundTelemetryText(args.factValue);
  return { ...args, sourceField: boundTelemetryText(args.sourceField, 160), factValue, factHash: hashTelemetryValue(factValue), reasonCode: boundTelemetryText(args.reasonCode, 100) };
}

export function safeEvidenceSummary(event: CanonicalAiTelemetryEvent) {
  if (event.eventKind !== "transition.evaluation") return undefined;
  return event.payload.evidence.map(({ sourceField, factKind, factHash, matchStatus, reasonCode }) => ({ sourceField, factKind, factHash, matchStatus, reasonCode }));
}
