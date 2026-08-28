export type ResumePdfPreviewState = {
  status: "generating" | "ready" | "error";
  attemptId: number;
  pageCount: number | null;
  error: string | null;
};

export type ResumePdfPreviewAction =
  | { type: "ready"; attemptId: number; pageCount: number }
  | { type: "error"; attemptId: number; error: string }
  | { type: "regenerate" }
  | { type: "retry" };

export function createResumePdfPreviewState(attemptId = 1): ResumePdfPreviewState {
  return { status: "generating", attemptId, pageCount: null, error: null };
}

export function resumePdfPreviewReducer(
  state: ResumePdfPreviewState,
  action: ResumePdfPreviewAction,
): ResumePdfPreviewState {
  if (action.type === "retry") {
    return createResumePdfPreviewState(state.attemptId + 1);
  }
  if (action.type === "regenerate") {
    return { status: "generating", attemptId: state.attemptId + 1, pageCount: state.pageCount, error: null };
  }
  if (state.status !== "generating" || action.attemptId !== state.attemptId) return state;
  if (action.type === "ready") {
    return Number.isInteger(action.pageCount) && action.pageCount > 0
      ? { status: "ready", attemptId: state.attemptId, pageCount: action.pageCount, error: null }
      : { status: "error", attemptId: state.attemptId, pageCount: null, error: "Invalid generated page count" };
  }
  return { status: "error", attemptId: state.attemptId, pageCount: null, error: action.error };
}
