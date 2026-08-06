import { createHash } from "node:crypto";

function digest(namespace: string, parts: readonly (string | number | null | undefined)[]) {
  return createHash("sha256")
    .update([namespace, ...parts.map((part) => part ?? "null")].join("\u001f"))
    .digest("hex");
}

export function normalizeCanonicalTraceId(value: string | null | undefined, ...fallback: readonly (string | number | null | undefined)[]) {
  const normalized = value?.toLowerCase().replaceAll("-", "");
  return normalized && /^[0-9a-f]{32}$/.test(normalized)
    ? normalized
    : digest("ai-telemetry:trace:v1", fallback.length ? fallback : [value]).slice(0, 32);
}

export function deriveCanonicalSpanId(...parts: readonly (string | number | null | undefined)[]) {
  return digest("ai-telemetry:span:v1", parts).slice(0, 16);
}

export function deriveCanonicalEventId(...parts: readonly (string | number | null | undefined)[]) {
  return `aevt_${digest("ai-telemetry:event:v1", parts).slice(0, 48)}`;
}

export function pseudonymousActorReference(actorId: string) {
  return `actor_${digest("ai-telemetry:actor:v1", [actorId]).slice(0, 24)}`;
}
