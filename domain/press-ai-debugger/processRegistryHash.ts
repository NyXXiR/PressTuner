import type { PressAiProcessDefinition } from "./processRegistry";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function getProcessRegistryHash(process: PressAiProcessDefinition): string {
  const identity = {
    id: process.id, version: process.version,
    nodes: process.nodes.map(({ id, sequence, operationKey, quotaUnits, gate }) => ({ id, sequence, operationKey, quotaUnits: quotaUnits ?? 0, gate: gate ?? null })),
    edges: process.edges.map(({ id, sequence, source, target, payload, mandatoryGuardrailIds, humanGate }) => ({ id, sequence, source, target, payload, mandatoryGuardrailIds, humanGate: humanGate ?? null })),
  };
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonical(identity))) { hash ^= byte; hash = Math.imul(hash, 0x01000193); }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
