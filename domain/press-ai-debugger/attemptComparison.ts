import type { GuardrailVerdict } from "./transitionGuardrails";

const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function compareAttemptOutputs(args: { baselineOutput: unknown; candidateOutput: unknown; baselineVerdict: GuardrailVerdict | null; candidateVerdict: GuardrailVerdict | null; maxFields?: number }) {
  const before = object(args.baselineOutput); const after = object(args.candidateOutput); const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().slice(0, args.maxFields ?? 100);
  return { oldVerdict: args.baselineVerdict, newVerdict: args.candidateVerdict, changed: args.baselineVerdict !== args.candidateVerdict || keys.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])), fields: keys.map((key) => ({ key, oldValue: before[key] ?? null, newValue: after[key] ?? null, changed: JSON.stringify(before[key]) !== JSON.stringify(after[key]) })) };
}
