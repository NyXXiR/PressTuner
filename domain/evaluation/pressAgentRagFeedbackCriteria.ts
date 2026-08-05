import type {
  PressAgentGuardrailId,
  PressAgentGuardrailStageId,
  PressAgentGuardrailVerdict,
} from "./pressAgentGuardrailSignals";

export type QualityDimensionId = "retrieval" | "grounded_answer" | "abstention";

export type PressAgentRagFeedbackCriterion = Readonly<{
  criterionId: string;
  criteriaVersion: 1;
  dimensionId: QualityDimensionId;
  direction: "higher_is_better";
  unit: "score";
  passScore: 1;
  violationScore: 0;
  stageId: PressAgentGuardrailStageId;
  guardrailId: PressAgentGuardrailId;
}>;

export type PressAgentRagFeedback = Readonly<{
  key: string;
  score: number;
  direction: "higher_is_better";
  unit: "score";
}>;

export const PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1 = Object.freeze([
  Object.freeze({ criterionId: "rag.retrieval.evidence_use.v1", criteriaVersion: 1, dimensionId: "retrieval", direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0, stageId: "retrieval-execution", guardrailId: "evidence-use" }),
  Object.freeze({ criterionId: "rag.retrieval.tool_execution.v1", criteriaVersion: 1, dimensionId: "retrieval", direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0, stageId: "retrieval-execution", guardrailId: "expected-tool-behavior" }),
  Object.freeze({ criterionId: "rag.abstention.evidence_decision.v1", criteriaVersion: 1, dimensionId: "abstention", direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0, stageId: "evidence-decision", guardrailId: "safe-fallback" }),
  Object.freeze({ criterionId: "rag.grounded_answer.citation_presence.v1", criteriaVersion: 1, dimensionId: "grounded_answer", direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0, stageId: "response-behavior", guardrailId: "citation-claim-verification" }),
  Object.freeze({ criterionId: "rag.grounded_answer.claim_verification.v1", criteriaVersion: 1, dimensionId: "grounded_answer", direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0, stageId: "verification", guardrailId: "citation-claim-verification" }),
  Object.freeze({ criterionId: "rag.abstention.verification_fallback.v1", criteriaVersion: 1, dimensionId: "abstention", direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0, stageId: "fallback", guardrailId: "safe-fallback" }),
] satisfies readonly PressAgentRagFeedbackCriterion[]);

const criterionByRuntimeVerdict = new Map(
  PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.map((criterion) => [
    `${criterion.stageId}:${criterion.guardrailId}`,
    criterion,
  ]),
);

export function derivePressAgentRagFeedback(
  verdicts: readonly Readonly<{
    stageId: string;
    guardrailId: string;
    verdict: PressAgentGuardrailVerdict;
  }>[],
): readonly PressAgentRagFeedback[] {
  const feedback: PressAgentRagFeedback[] = [];
  for (const verdict of verdicts) {
    if (verdict.verdict === "not_evaluable") continue;
    const criterion = criterionByRuntimeVerdict.get(`${verdict.stageId}:${verdict.guardrailId}`);
    if (!criterion) continue;
    feedback.push({
      key: criterion.criterionId,
      score: verdict.verdict === "pass" ? criterion.passScore : criterion.violationScore,
      direction: criterion.direction,
      unit: criterion.unit,
    });
  }
  return feedback;
}
