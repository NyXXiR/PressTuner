/**
 * Turns what a live press-agent run actually observed into guardrail verdicts for
 * Ops Console. Each verdict names the workflow stage it belongs to, so the report can
 * attribute a violation to a point in the pipeline instead of only to a provider.
 *
 * Only guardrails the runtime can genuinely judge are reported. Anything the run does not
 * observe is left out rather than guessed: an absent verdict reads as "not checked", while
 * a wrong verdict would silently corrupt the operations report.
 */

export const PRESS_AGENT_GUARDRAIL_STAGE_IDS = [
  "retrieval-execution",
  "evidence-decision",
  "response-behavior",
  "verification",
  "fallback",
] as const;

export type PressAgentGuardrailStageId = (typeof PRESS_AGENT_GUARDRAIL_STAGE_IDS)[number];

export type PressAgentGuardrailId =
  | "evidence-use"
  | "citation-claim-verification"
  | "forbidden-source-protection"
  | "expected-tool-behavior"
  | "safe-fallback";

export type PressAgentGuardrailVerdict = "pass" | "violation" | "not_evaluable";

/** What the runtime knows by the time an operation completes. */
export type PressAgentGuardrailObservation = Readonly<{
  /** Sources retrieved and usable as evidence. */
  verifiableSourceCount: number;
  /** Citations kept on the final answer. */
  finalCitationCount: number;
  /** Tool calls that failed, if the runtime tracked any. */
  failedToolCount: number | null;
  /** Result of verifying the final answer's claim spans. */
  claimVerificationStatus: "PASS" | "FAIL" | null;
  /** Set when the run fell back after a failed verification. */
  fallbackMode: "EXTRACTIVE" | "ABSTENTION" | null;
  /** Result of verifying the replacement response, when fallback ran. */
  postFallbackVerificationStatus: "PASS" | "FAIL" | null;
  /** Whether the run withheld an answer. */
  cannotAnswer: boolean | null;
}>;

export type PressAgentGuardrailVerdictRecord = Readonly<{
  stageId: PressAgentGuardrailStageId;
  guardrailId: PressAgentGuardrailId;
  verdict: PressAgentGuardrailVerdict;
}>;

export type PressAgentCompletionObservationInput = Readonly<{
  verifiableSourceCount: number;
  finalCitationCount: number;
  failedToolCount: number | null;
  primaryClaimVerificationStatus: "PASS" | "FAIL" | null;
  fallbackMode: "EXTRACTIVE" | "ABSTENTION" | null;
  postFallbackVerificationStatus: "PASS" | "FAIL" | null;
  cannotAnswer: boolean | null;
}>;

/**
 * Projects completion counters/statuses into the stable guardrail input. The primary
 * verification result is deliberately authoritative even when a later fallback passes.
 */
export function buildPressAgentCompletionObservation(
  input: PressAgentCompletionObservationInput,
): PressAgentGuardrailObservation {
  return {
    verifiableSourceCount: Math.max(0, input.verifiableSourceCount),
    finalCitationCount: Math.max(0, input.finalCitationCount),
    failedToolCount: input.failedToolCount === null ? null : Math.max(0, input.failedToolCount),
    claimVerificationStatus: input.primaryClaimVerificationStatus,
    fallbackMode: input.fallbackMode,
    postFallbackVerificationStatus: input.postFallbackVerificationStatus,
    cannotAnswer: input.cannotAnswer,
  };
}

function record(
  stageId: PressAgentGuardrailStageId,
  guardrailId: PressAgentGuardrailId,
  verdict: PressAgentGuardrailVerdict,
): PressAgentGuardrailVerdictRecord {
  return { stageId, guardrailId, verdict };
}

export function deriveGuardrailVerdicts(
  observation: PressAgentGuardrailObservation,
): readonly PressAgentGuardrailVerdictRecord[] {
  const verdicts: PressAgentGuardrailVerdictRecord[] = [];
  const answered = observation.cannotAnswer === false;

  // Retrieval: answering with no usable evidence is the violation, not retrieving nothing
  // for a question the run then withheld an answer to.
  verdicts.push(record(
    "retrieval-execution",
    "evidence-use",
    observation.verifiableSourceCount > 0 ? "pass" : answered ? "violation" : "not_evaluable",
  ));

  if (observation.failedToolCount !== null) {
    verdicts.push(record(
      "retrieval-execution",
      "expected-tool-behavior",
      observation.failedToolCount === 0 ? "pass" : "violation",
    ));
  }

  // Answerability: withholding when there is no evidence is the guardrail working.
  if (observation.cannotAnswer !== null) {
    verdicts.push(record(
      "evidence-decision",
      "safe-fallback",
      observation.cannotAnswer && observation.verifiableSourceCount === 0 ? "pass"
        : answered && observation.verifiableSourceCount > 0 ? "pass"
          : "not_evaluable",
    ));
  }

  // An answer that cites nothing is unsupported; a withheld answer cites nothing by design.
  verdicts.push(record(
    "response-behavior",
    "citation-claim-verification",
    answered ? (observation.finalCitationCount > 0 ? "pass" : "violation") : "not_evaluable",
  ));

  if (observation.claimVerificationStatus !== null) {
    verdicts.push(record(
      "verification",
      "citation-claim-verification",
      observation.claimVerificationStatus === "PASS" ? "pass" : "violation",
    ));
  }

  // Falling back after a failed verification is the guardrail working; failing verification
  // without falling back is the violation.
  if (observation.claimVerificationStatus !== null) {
    verdicts.push(record(
      "fallback",
      "safe-fallback",
      observation.claimVerificationStatus === "PASS"
        ? (observation.fallbackMode === null ? "pass" : "not_evaluable")
        : observation.fallbackMode !== null && observation.postFallbackVerificationStatus === "PASS"
          ? "pass"
          : "violation",
    ));
  }

  return verdicts;
}
