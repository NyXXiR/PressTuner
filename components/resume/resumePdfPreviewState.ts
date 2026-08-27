export type ResumePdfPreviewState = {
  status: "loading" | "ready" | "error" | "printing";
  generation: number;
  pageCount: number | null;
  error: string | null;
};

export type ResumePdfPreviewAction =
  | { type: "ready"; generation: number; pageCount: number }
  | { type: "error"; generation: number; error: string }
  | { type: "retry" }
  | { type: "print" }
  | { type: "print-finished" };

export function createResumePdfPreviewState(generation = 1): ResumePdfPreviewState {
  return { status: "loading", generation, pageCount: null, error: null };
}

export function resumePdfPreviewReducer(
  state: ResumePdfPreviewState,
  action: ResumePdfPreviewAction,
): ResumePdfPreviewState {
  if (action.type === "retry") {
    return state.status === "error"
      ? createResumePdfPreviewState(state.generation + 1)
      : state;
  }
  if (action.type === "print") {
    return state.status === "ready" ? { ...state, status: "printing" } : state;
  }
  if (action.type === "print-finished") {
    return state.status === "printing" ? { ...state, status: "ready" } : state;
  }
  if (state.status !== "loading" || action.generation !== state.generation) return state;
  if (action.type === "ready") {
    return Number.isInteger(action.pageCount) && action.pageCount > 0
      ? { status: "ready", generation: state.generation, pageCount: action.pageCount, error: null }
      : { status: "error", generation: state.generation, pageCount: null, error: "Invalid generated page count" };
  }
  return { status: "error", generation: state.generation, pageCount: null, error: action.error };
}
