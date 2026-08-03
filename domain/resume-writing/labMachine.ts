import {
  createResumeWritingLabState,
  draftFor,
  organizeLabIntake,
  suggestionFor,
} from "./labFixtures";
import { candidateFor, resolveCandidate } from "./labExperience";
import type {
  LabCandidateResolution,
  LabExperienceCandidate,
  LabQuestion,
  ResumeWritingLabState,
} from "./labTypes";

export { createResumeWritingLabState } from "./labFixtures";
export type {
  LabCandidateResolution,
  LabExperienceBrick,
  LabExperienceCandidate,
  LabQuestion,
  LabQuestionStatus,
  LabStage,
  ResumeWritingLabState,
} from "./labTypes";

type LabTargetField = "company" | "role" | "deadline" | "summary";

export type ResumeWritingLabAction =
  | { readonly type: "restore_session"; readonly state: ResumeWritingLabState }
  | { readonly type: "update_intake"; readonly field: "rawText" | "postingUrl"; readonly value: string }
  | { readonly type: "organize_intake" }
  | { readonly type: "back_to_intake" }
  | { readonly type: "update_target"; readonly field: LabTargetField; readonly value: string }
  | { readonly type: "update_question_prompt"; readonly questionId: string; readonly value: string }
  | { readonly type: "update_question_limit"; readonly questionId: string; readonly value: number }
  | { readonly type: "add_question" }
  | { readonly type: "remove_question"; readonly questionId: string }
  | { readonly type: "confirm_review" }
  | { readonly type: "select_question"; readonly questionId: string }
  | { readonly type: "toggle_brick_link"; readonly brickId: string }
  | { readonly type: "update_answer"; readonly value: string }
  | { readonly type: "send_prompt"; readonly prompt: string }
  | { readonly type: "apply_suggestion" }
  | { readonly type: "discard_suggestion" }
  | { readonly type: "save_question" }
  | { readonly type: "complete_question" }
  | { readonly type: "reopen_question"; readonly questionId: string }
  | { readonly type: "extract_active_experience" }
  | { readonly type: "save_inline_candidate"; readonly resolution: LabCandidateResolution }
  | { readonly type: "dismiss_inline_candidate" }
  | { readonly type: "complete_application" }
  | { readonly type: "set_candidate_resolution"; readonly candidateId: string; readonly resolution: LabCandidateResolution }
  | { readonly type: "save_candidates" }
  | { readonly type: "dismiss_notice" }
  | { readonly type: "reset" };

class UnexpectedLabActionError extends Error {
  constructor(readonly action: never) {
    super("Unexpected resume writing lab action");
    this.name = "UnexpectedLabActionError";
  }
}

function updateActiveQuestion(
  state: ResumeWritingLabState,
  update: (question: LabQuestion) => LabQuestion,
): readonly LabQuestion[] {
  return state.questions.map((question) =>
    question.id === state.activeQuestionId ? update(question) : question,
  );
}

function activeQuestion(state: ResumeWritingLabState): LabQuestion | null {
  return state.questions.find(
    (question) => question.id === state.activeQuestionId,
  ) ?? null;
}

function canReview(state: ResumeWritingLabState): boolean {
  return Boolean(
    state.target.company.trim() &&
    state.target.role.trim() &&
    state.questions.some((question) => question.prompt.trim()),
  );
}

function generateAllDrafts(state: ResumeWritingLabState): ResumeWritingLabState {
  return {
    ...state,
    stage: "writing",
    questions: state.questions.map((question) => ({
      ...question,
      answer: draftFor(question, state),
      status: "drafted",
      messages: [
        {
          id: `${question.id}-drafted`,
          role: "assistant",
          body: "공고와 연결 경험을 바탕으로 초안을 만들었어요. 원하는 수정 방향을 말해 주세요.",
        },
      ],
    })),
    activeQuestionId: state.questions[0]?.id ?? null,
    notice: "모든 문항의 샘플 초안을 만들었습니다.",
  };
}

function finalCaptureCandidates(
  questions: readonly LabQuestion[],
): readonly LabExperienceCandidate[] {
  return questions.map(candidateFor);
}

export function resumeWritingLabReducer(
  state: ResumeWritingLabState,
  action: ResumeWritingLabAction,
): ResumeWritingLabState {
  switch (action.type) {
    case "restore_session":
      return action.state;
    case "update_intake":
      return state.stage === "intake"
        ? { ...state, intake: { ...state.intake, [action.field]: action.value } }
        : state;
    case "organize_intake":
      return state.stage === "intake" &&
        Boolean(state.intake.rawText.trim() || state.intake.postingUrl.trim())
        ? organizeLabIntake(state)
        : state;
    case "back_to_intake":
      return state.stage === "review" ? { ...state, stage: "intake" } : state;
    case "update_target":
      return state.stage === "review"
        ? { ...state, target: { ...state.target, [action.field]: action.value } }
        : state;
    case "update_question_prompt":
      return state.stage === "review"
        ? { ...state, questions: state.questions.map((question) =>
            question.id === action.questionId ? { ...question, prompt: action.value } : question) }
        : state;
    case "update_question_limit":
      return state.stage === "review"
        ? { ...state, questions: state.questions.map((question) =>
            question.id === action.questionId ? { ...question, charLimit: Math.min(3_000, Math.max(100, action.value || 100)) } : question) }
        : state;
    case "add_question": {
      if (state.stage !== "review") return state;
      const index = state.questions.reduce((largest, question) => Math.max(largest, Number(question.id.split("-").at(-1)) || 0), 0) + 1;
      return { ...state, questions: [...state.questions, {
        id: `question-${index}`, prompt: "", charLimit: 700, answer: "", status: "ready",
        revisionCount: 0, messages: [], pendingSuggestion: null, linkedBrickIds: [],
      }] };
    }
    case "remove_question":
      return state.stage === "review" && state.questions.length > 1
        ? { ...state, questions: state.questions.filter((question) => question.id !== action.questionId) }
        : state;
    case "confirm_review":
      return state.stage === "review" && canReview(state)
        ? generateAllDrafts(state)
        : state;
    case "select_question":
      return state.stage === "writing" && state.questions.some((question) => question.id === action.questionId)
        ? { ...state, activeQuestionId: action.questionId }
        : state;
    case "toggle_brick_link":
      return state.stage === "writing"
        ? { ...state, questions: updateActiveQuestion(state, (question) => ({
            ...question,
            linkedBrickIds: question.linkedBrickIds.includes(action.brickId)
              ? question.linkedBrickIds.filter((id) => id !== action.brickId)
              : [...question.linkedBrickIds, action.brickId],
          })) }
        : state;
    case "update_answer":
      return state.stage === "writing"
        ? { ...state, questions: updateActiveQuestion(state, (question) =>
            question.status === "completed" ? question : { ...question, answer: action.value, status: "revised" }) }
        : state;
    case "send_prompt": {
      if (state.stage !== "writing" || !action.prompt.trim()) return state;
      return { ...state, questions: updateActiveQuestion(state, (question) => {
        if (!question.answer.trim() || question.status === "completed") return question;
        const index = question.messages.length;
        return { ...question, pendingSuggestion: suggestionFor(question, action.prompt, state), messages: [
          ...question.messages,
          { id: `${question.id}-${index}-user`, role: "user", body: action.prompt.trim() },
          { id: `${question.id}-${index}-assistant`, role: "assistant", body: "요청을 반영한 수정안을 만들었어요. 비교 후 적용해 주세요." },
        ] };
      }) };
    }
    case "apply_suggestion":
      return state.stage === "writing"
        ? { ...state, questions: updateActiveQuestion(state, (question) => question.pendingSuggestion
            ? { ...question, answer: question.pendingSuggestion.revised, pendingSuggestion: null, status: "revised", revisionCount: question.revisionCount + 1 }
            : question) }
        : state;
    case "discard_suggestion":
      return state.stage === "writing"
        ? { ...state, questions: updateActiveQuestion(state, (question) => ({ ...question, pendingSuggestion: null })) }
        : state;
    case "save_question":
      return state.stage === "writing"
        ? { ...state, questions: updateActiveQuestion(state, (question) => question.answer.trim() && question.status !== "completed"
            ? { ...question, status: "saved", pendingSuggestion: null }
            : question), notice: "현재 문항을 로컬 상태에 임시저장했습니다." }
        : state;
    case "complete_question": {
      if (state.stage !== "writing") return state;
      const current = activeQuestion(state);
      if (!current?.answer.trim()) return state;
      const questions = updateActiveQuestion(state, (question) => ({ ...question, status: "completed", pendingSuggestion: null }));
      const next = questions.find((question) => question.status !== "completed");
      return { ...state, questions, activeQuestionId: next?.id ?? current.id, notice: next ? "문항을 완료하고 다음 문항으로 이동했습니다." : "모든 문항이 완료되었습니다." };
    }
    case "reopen_question":
      return state.stage === "writing"
        ? { ...state, activeQuestionId: action.questionId, questions: state.questions.map((question) =>
            question.id === action.questionId && question.status === "completed" ? { ...question, status: "saved" } : question) }
        : state;
    case "extract_active_experience": {
      if (state.stage !== "writing") return state;
      const current = activeQuestion(state);
      if (!current?.answer.trim()) return state;
      return { ...state, inlineCandidate: candidateFor(current, state.questions.indexOf(current)) };
    }
    case "save_inline_candidate":
      return state.stage === "writing" && state.inlineCandidate
        ? { ...resolveCandidate(state, state.inlineCandidate, action.resolution), inlineCandidate: null, notice: "경험을 저장하고 현재 문항에 연결했습니다." }
        : state;
    case "dismiss_inline_candidate":
      return { ...state, inlineCandidate: null };
    case "complete_application":
      return state.stage === "writing" && state.questions.every((question) => question.status === "completed")
        ? { ...state, stage: "capture", captureCandidates: finalCaptureCandidates(state.questions), notice: null }
        : state;
    case "set_candidate_resolution":
      return state.stage === "capture"
        ? { ...state, captureCandidates: state.captureCandidates.map((candidate) =>
            candidate.id === action.candidateId ? { ...candidate, resolution: action.resolution } : candidate) }
        : state;
    case "save_candidates": {
      if (state.stage !== "capture") return state;
      const resolved = state.captureCandidates.reduce(
        (current, candidate) => resolveCandidate(current, candidate, candidate.resolution),
        state,
      );
      return { ...resolved, stage: "done", inlineCandidate: null, notice: null };
    }
    case "dismiss_notice":
      return { ...state, notice: null };
    case "reset":
      return createResumeWritingLabState();
    default:
      throw new UnexpectedLabActionError(action);
  }
}
