import type { PressAiProcessId } from "./processRegistry";

export const PROCESS_DETAIL_LIMITS = Object.freeze({ text: 4_000, list: 100 });

export function boundProcessDetail(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.slice(0, PROCESS_DETAIL_LIMITS.text);
  if (Array.isArray(value)) return value.slice(0, PROCESS_DETAIL_LIMITS.list).map((entry) => boundProcessDetail(entry, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, PROCESS_DETAIL_LIMITS.list).map(([key, entry]) => [key, boundProcessDetail(entry, depth + 1)]));
  return value;
}

/**
 * Press creation AgentStep rows are domain-process nodes. Legacy RAG AgentStep
 * rows remain operational model/tool traces; RAG graph truth comes from saved
 * workflow audit events and its compatibility detail projector.
 */
export function processStepPersistenceMode(processId: PressAiProcessId) {
  return processId === "press-creation" ? "DOMAIN_PROCESS_STEPS" : "AUDIT_EVENT_TOPOLOGY";
}
