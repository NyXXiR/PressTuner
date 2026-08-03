export type CareerRegistrationStatus =
  | "PROCESSING"
  | "REVIEW_REQUIRED"
  | "READY"
  | "EMPTY"
  | "FAILED";

export type CareerRegistrationNextAction =
  | { readonly type: "wait_for_processing" }
  | { readonly type: "review_candidates" }
  | { readonly type: "start_application" }
  | { readonly type: "add_career_memory" }
  | { readonly type: "retry_source" };

export function projectCareerRegistrationReadiness(input: {
  readonly confirmedExperienceCount: number;
  readonly trustedFactCount: number;
  readonly pendingCandidateCount: number;
  readonly processingSourceCount: number;
  readonly failedSourceCount: number;
}): {
  readonly registrationStatus: CareerRegistrationStatus;
  readonly nextAction: CareerRegistrationNextAction;
} {
  if (input.processingSourceCount > 0) {
    return {
      registrationStatus: "PROCESSING",
      nextAction: { type: "wait_for_processing" },
    };
  }
  if (input.pendingCandidateCount > 0) {
    return {
      registrationStatus: "REVIEW_REQUIRED",
      nextAction: { type: "review_candidates" },
    };
  }
  if (input.confirmedExperienceCount > 0 && input.trustedFactCount > 0) {
    return {
      registrationStatus: "READY",
      nextAction: { type: "start_application" },
    };
  }
  if (input.failedSourceCount > 0) {
    return {
      registrationStatus: "FAILED",
      nextAction: { type: "retry_source" },
    };
  }
  return {
    registrationStatus: "EMPTY",
    nextAction: { type: "add_career_memory" },
  };
}
