import { pressCreationProcess } from "./processRegistry";

export const MANDATORY_EVALUATOR_VERSION = "1.0.0" as const;
export const PRESS_AI_MANDATORY_EVALUATOR_IDS = Object.freeze(
  [...new Set(pressCreationProcess.edges.flatMap((edge) => edge.mandatoryGuardrailIds))],
);

export function isKnownMandatoryEvaluatorId(id: string): boolean {
  return PRESS_AI_MANDATORY_EVALUATOR_IDS.includes(id);
}

export function assertKnownMandatoryEvaluatorIds(ids: readonly string[]): void {
  const unknown = ids.filter((id) => !isKnownMandatoryEvaluatorId(id));
  if (unknown.length) throw Object.assign(new Error("PRESS_AI_MANDATORY_EVALUATOR_UNKNOWN"), { evaluatorIds: unknown });
}
