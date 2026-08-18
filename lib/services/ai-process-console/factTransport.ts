import type { EventV1 } from "@/domain/ai-process-console/v1/contracts";
import type { EventV2 } from "@/domain/ai-process-console/v2/contracts";

export type AiProcessFact = EventV1 | EventV2;

export const AI_PROCESS_FACT_MAX_ATTEMPTS = 8;
export const AI_PROCESS_FACT_MAX_BACKOFF_MS = 60 * 60 * 1000;

export type FactDeliveryErrorCode =
  | "AUTHENTICATION_FAILED"
  | "CONTRACT_INVALID"
  | "SEQUENCE_CONFLICT"
  | "TRANSPORT_TIMEOUT"
  | "CONSOLE_THROTTLED"
  | "CONSOLE_UNAVAILABLE"
  | "TRANSPORT_FAILED"
  | "HTTP_REJECTED";

export type FactDeliveryResult =
  | { status: "DELIVERED" }
  | { status: "RETRYABLE"; code: Extract<FactDeliveryErrorCode, "TRANSPORT_TIMEOUT" | "CONSOLE_THROTTLED" | "CONSOLE_UNAVAILABLE" | "TRANSPORT_FAILED"> }
  | { status: "PERMANENT"; code: Extract<FactDeliveryErrorCode, "AUTHENTICATION_FAILED" | "CONTRACT_INVALID" | "SEQUENCE_CONFLICT" | "HTTP_REJECTED"> };

export type AiProcessFactTransport = Readonly<{
  deliver: (fact: AiProcessFact) => Promise<FactDeliveryResult>;
}>;

const permanentCodes = new Set<FactDeliveryErrorCode>(["AUTHENTICATION_FAILED", "CONTRACT_INVALID", "SEQUENCE_CONFLICT", "HTTP_REJECTED"]);
const retryableCodes = new Set<FactDeliveryErrorCode>(["TRANSPORT_TIMEOUT", "CONSOLE_THROTTLED", "CONSOLE_UNAVAILABLE", "TRANSPORT_FAILED"]);

export function normalizeFactDeliveryError(error: unknown): FactDeliveryResult {
  const code = error instanceof Error ? (error as Error & { code?: string }).code ?? error.message : "TRANSPORT_FAILED";
  const safeCode = typeof code === "string" && (permanentCodes.has(code as FactDeliveryErrorCode) || retryableCodes.has(code as FactDeliveryErrorCode))
    ? code as FactDeliveryErrorCode
    : "TRANSPORT_FAILED";
  if (permanentCodes.has(safeCode)) return { status: "PERMANENT", code: safeCode as Extract<FactDeliveryErrorCode, "AUTHENTICATION_FAILED" | "CONTRACT_INVALID" | "SEQUENCE_CONFLICT" | "HTTP_REJECTED"> };
  return { status: "RETRYABLE", code: safeCode as Extract<FactDeliveryErrorCode, "TRANSPORT_TIMEOUT" | "CONSOLE_THROTTLED" | "CONSOLE_UNAVAILABLE" | "TRANSPORT_FAILED"> };
}

export function factRetryDelayMs(attemptCount: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attemptCount - 1), AI_PROCESS_FACT_MAX_BACKOFF_MS);
}
