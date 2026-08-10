export type PressArticleStatus =
  | "BRIEF"
  | "DRAFT"
  | "IN_PROGRESS"
  | "FINAL"
  | "DECLINED";

export type PressPhase =
  | "INTAKE"
  | "BRIEF_READY"
  | "DRAFT_READY"
  | "EDITING"
  | "FINALIZED";

export type PressApprovalState =
  | "NOT_REQUESTED"
  | "PENDING"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "DISMISSED";

export type PressPhaseProjection = {
  phase: PressPhase;
  approval: PressApprovalState;
};

export type PressPersistenceSnapshot = {
  status: PressArticleStatus;
  hasRawInput?: boolean;
  hasGeneratedContent?: boolean;
  hasHarness?: boolean;
  approval?: PressApprovalState;
};

export function derivePressPhase(snapshot: PressPersistenceSnapshot): PressPhase {
  if (snapshot.status === "FINAL") return "FINALIZED";
  if (snapshot.status === "BRIEF") return "BRIEF_READY";
  if (snapshot.status === "IN_PROGRESS" || snapshot.status === "DECLINED") {
    return "EDITING";
  }
  if (snapshot.approval === "CHANGES_REQUESTED") return "EDITING";
  if (
    snapshot.hasRawInput ||
    snapshot.hasGeneratedContent ||
    snapshot.hasHarness
  ) {
    return "DRAFT_READY";
  }
  return "INTAKE";
}

export function projectArticleStatus(
  state: PressPhaseProjection,
): PressArticleStatus {
  switch (state.phase) {
    case "INTAKE":
      return "DRAFT";
    case "BRIEF_READY":
      return "BRIEF";
    case "DRAFT_READY":
      return "DRAFT";
    case "FINALIZED":
      return "FINAL";
    case "EDITING":
      if (state.approval === "CHANGES_REQUESTED") return "DRAFT";
      if (state.approval === "DISMISSED") return "DECLINED";
      return "IN_PROGRESS";
  }
}
