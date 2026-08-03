export type FeedbackCandidateInput = {
  sourceTeamId: string;
  targetTeamId: string;
  terminal: boolean;
  consent: boolean;
  eligibleForEvaluation: boolean;
  containsProhibitedData: boolean;
  sourceKind:
    | "negative_feedback"
    | "citation_accuracy"
    | "approval_rejection"
    | "runtime_failure"
    | "draft_edit"
    | "verification_finding"
    | "retry_trace";
};

export function evaluateFeedbackEligibility(input: FeedbackCandidateInput) {
  const reasons: string[] = [];
  if (input.sourceTeamId !== input.targetTeamId) reasons.push("CROSS_TEAM_SOURCE");
  if (!input.terminal) reasons.push("NON_TERMINAL_TRACE");
  if (!input.consent) reasons.push("CONSENT_REQUIRED");
  if (!input.eligibleForEvaluation) reasons.push("EVALUATION_INELIGIBLE");
  if (input.containsProhibitedData) reasons.push("PROHIBITED_DATA");
  return { eligible: reasons.length === 0, reasons } as const;
}
