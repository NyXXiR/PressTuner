import { isVerificationCurrent } from "@/domain/article/verificationPolicy";

import {
  derivePressPhase,
  projectArticleStatus,
  type PressApprovalState,
  type PressArticleStatus,
  type PressPersistenceSnapshot,
  type PressPhase,
} from "./articleStatusProjection";

export type {
  PressApprovalState,
  PressArticleStatus,
  PressPersistenceSnapshot,
  PressPhase,
};
export { derivePressPhase, projectArticleStatus };

export type PressVerificationFingerprint = {
  draftHash: string;
  groundingRevision: number;
  corpusVersion: number;
};

export type PressVerificationState =
  | { kind: "MISSING" }
  | {
      kind: "CURRENT" | "STALE";
      result: "PASS" | "WARN" | "BLOCK";
      fingerprint: PressVerificationFingerprint;
    };

export type PressProcessState = {
  phase: PressPhase;
  verification: PressVerificationState;
  approval: PressApprovalState;
  hasReview: boolean;
  hasPendingRewrite: boolean;
};

export type PressCommand =
  | { type: "NORMALIZE_BRIEF" }
  | { type: "GENERATE_DRAFT" }
  | { type: "START_EDITING" }
  | { type: "SAVE_CONTENT"; contentChanged: boolean }
  | { type: "COMPLETE_REVIEW" }
  | { type: "REQUEST_REWRITE" }
  | { type: "APPLY_REWRITE"; contentChanged: boolean }
  | { type: "REQUEST_APPROVAL" }
  | { type: "REVIEW_ASSIGNMENTS_CHANGED" }
  | { type: "RECORD_APPROVAL"; outcome: PressApprovalState }
  | {
      type: "RECORD_VERIFICATION";
      result: "PASS" | "WARN" | "BLOCK";
      fingerprint: PressVerificationFingerprint;
    }
  | { type: "GROUNDING_CHANGED" }
  | { type: "CORPUS_CHANGED" }
  | { type: "FINALIZE" }
  | { type: "SET_COMPATIBILITY_STATUS"; status: PressArticleStatus };

export type PressDomainErrorCode =
  | "PRESS_TRANSITION_INVALID"
  | "PRESS_FINALIZED_IMMUTABLE"
  | "ARTICLE_VERIFICATION_REQUIRED"
  | "ARTICLE_VERIFICATION_STALE"
  | "ARTICLE_VERIFICATION_BLOCKED";

const ERROR_MESSAGES: Record<PressDomainErrorCode, string> = {
  PRESS_TRANSITION_INVALID: "요청한 상태 전환을 수행할 수 없습니다.",
  PRESS_FINALIZED_IMMUTABLE: "최종 확정된 문서는 변경할 수 없습니다.",
  ARTICLE_VERIFICATION_REQUIRED: "최종 확정 전에 현재 초안을 검증해야 합니다.",
  ARTICLE_VERIFICATION_STALE: "초안이나 근거가 변경되었습니다. 다시 검증해 주세요.",
  ARTICLE_VERIFICATION_BLOCKED:
    "차단된 사실 오류를 수정하고 다시 검증해 주세요.",
};

export class PressDomainError extends Error {
  readonly status = 409;

  constructor(readonly code: PressDomainErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PressDomainError";
  }
}

export type PressDecision =
  | { ok: true; state: PressProcessState }
  | { ok: false; error: PressDomainError };

function accepted(state: PressProcessState): PressDecision {
  return { ok: true, state };
}

function rejected(code: PressDomainErrorCode): PressDecision {
  return { ok: false, error: new PressDomainError(code) };
}

function staleVerification(
  verification: PressVerificationState,
): PressVerificationState {
  return verification.kind === "MISSING"
    ? verification
    : { ...verification, kind: "STALE" };
}

export function classifyPressVerification(
  verification: PressVerificationState,
  currentFingerprint: PressVerificationFingerprint,
): PressVerificationState {
  if (verification.kind === "MISSING") return verification;
  return {
    ...verification,
    kind: isVerificationCurrent(verification.fingerprint, currentFingerprint)
      ? "CURRENT"
      : "STALE",
  };
}

export function assertPressFinalizable(state: PressProcessState): void {
  if (state.verification.kind === "MISSING") {
    throw new PressDomainError("ARTICLE_VERIFICATION_REQUIRED");
  }
  if (state.verification.kind === "STALE") {
    throw new PressDomainError("ARTICLE_VERIFICATION_STALE");
  }
  if (state.verification.result === "BLOCK") {
    throw new PressDomainError("ARTICLE_VERIFICATION_BLOCKED");
  }
}

export function resolveCompatibilityStatusCommand(
  state: PressProcessState,
  requestedStatus: PressArticleStatus,
): PressDecision {
  if (requestedStatus === "DECLINED") {
    return rejected("PRESS_TRANSITION_INVALID");
  }
  const currentStatus = projectArticleStatus(state);
  if (currentStatus === requestedStatus) return accepted(state);
  if (state.phase === "FINALIZED") {
    return rejected("PRESS_FINALIZED_IMMUTABLE");
  }

  switch (requestedStatus) {
    case "BRIEF":
      return state.phase === "INTAKE"
        ? accepted({ ...state, phase: "BRIEF_READY" })
        : rejected("PRESS_TRANSITION_INVALID");
    case "DRAFT":
      if (state.phase === "BRIEF_READY" || state.phase === "EDITING") {
        return accepted({
          ...state,
          phase: "DRAFT_READY",
          approval: "NOT_REQUESTED",
        });
      }
      return rejected("PRESS_TRANSITION_INVALID");
    case "IN_PROGRESS":
      return state.phase === "DRAFT_READY"
        ? accepted({ ...state, phase: "EDITING" })
        : rejected("PRESS_TRANSITION_INVALID");
    case "FINAL":
      if (state.phase !== "EDITING") return rejected("PRESS_TRANSITION_INVALID");
      try {
        assertPressFinalizable(state);
        return accepted({ ...state, phase: "FINALIZED" });
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof PressDomainError
              ? error
              : new PressDomainError("PRESS_TRANSITION_INVALID"),
        };
      }
  }
}

export function decidePressCommand(
  state: PressProcessState,
  command: PressCommand,
): PressDecision {
  if (command.type === "SET_COMPATIBILITY_STATUS") {
    return resolveCompatibilityStatusCommand(state, command.status);
  }
  if (state.phase === "FINALIZED") {
    return rejected("PRESS_FINALIZED_IMMUTABLE");
  }

  switch (command.type) {
    case "NORMALIZE_BRIEF":
      return state.phase === "INTAKE" || state.phase === "BRIEF_READY"
        ? accepted({ ...state, phase: "BRIEF_READY" })
        : rejected("PRESS_TRANSITION_INVALID");
    case "GENERATE_DRAFT":
      return state.phase === "BRIEF_READY"
        ? accepted({ ...state, phase: "DRAFT_READY" })
        : rejected("PRESS_TRANSITION_INVALID");
    case "START_EDITING":
      return state.phase === "DRAFT_READY"
        ? accepted({ ...state, phase: "EDITING" })
        : rejected("PRESS_TRANSITION_INVALID");
    case "SAVE_CONTENT":
      if (state.phase !== "DRAFT_READY" && state.phase !== "EDITING") {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted({
        ...state,
        phase: "EDITING",
        verification: command.contentChanged
          ? staleVerification(state.verification)
          : state.verification,
      });
    case "COMPLETE_REVIEW":
      if (state.phase !== "DRAFT_READY" && state.phase !== "EDITING") {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted({ ...state, phase: "EDITING", hasReview: true });
    case "REQUEST_REWRITE":
      if (state.phase !== "DRAFT_READY" && state.phase !== "EDITING") {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted({ ...state, phase: "EDITING", hasPendingRewrite: true });
    case "APPLY_REWRITE":
      if (state.phase !== "EDITING" || !state.hasPendingRewrite) {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted({
        ...state,
        hasPendingRewrite: false,
        verification: command.contentChanged
          ? staleVerification(state.verification)
          : state.verification,
      });
    case "REQUEST_APPROVAL":
      if (state.phase !== "DRAFT_READY" && state.phase !== "EDITING") {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted({ ...state, phase: "EDITING", approval: "PENDING" });
    case "REVIEW_ASSIGNMENTS_CHANGED":
      if (state.phase !== "DRAFT_READY" && state.phase !== "EDITING") {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted(state);
    case "RECORD_APPROVAL":
      if (
        state.phase !== "EDITING" ||
        command.outcome === "NOT_REQUESTED"
      ) {
        return rejected("PRESS_TRANSITION_INVALID");
      }
      return accepted({ ...state, approval: command.outcome });
    case "RECORD_VERIFICATION":
      return accepted({
        ...state,
        verification: {
          kind: "CURRENT",
          result: command.result,
          fingerprint: command.fingerprint,
        },
      });
    case "GROUNDING_CHANGED":
    case "CORPUS_CHANGED":
      return accepted({
        ...state,
        verification: staleVerification(state.verification),
      });
    case "FINALIZE":
      return resolveCompatibilityStatusCommand(state, "FINAL");
  }
}

export function requirePressTransition(
  state: PressProcessState,
  command: PressCommand,
): PressProcessState {
  const decision = decidePressCommand(state, command);
  if (!decision.ok) throw decision.error;
  return decision.state;
}
