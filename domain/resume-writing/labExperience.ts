import type {
  LabCandidateResolution,
  LabExperienceBrick,
  LabExperienceCandidate,
  LabQuestion,
  ResumeWritingLabState,
} from "./labTypes";

export function candidateFor(
  question: LabQuestion,
  index: number,
): LabExperienceCandidate {
  return {
    id: `candidate-${question.id}`,
    sourceQuestionId: question.id,
    title: index === 0 ? "가입 흐름 이탈 구간 개선" : "전환율 개선 실험",
    content: question.answer,
    tags: index === 0
      ? ["문제 정의", "고객 행동", "협업"]
      : ["실험", "데이터", "성과"],
    resolution: "create",
    matchedBrickId: question.linkedBrickIds[0] ?? null,
  };
}

function linkedQuestions(
  state: ResumeWritingLabState,
  candidate: LabExperienceCandidate,
  brickId: string,
): readonly LabQuestion[] {
  return state.questions.map((question) =>
    question.id === candidate.sourceQuestionId &&
    !question.linkedBrickIds.includes(brickId)
      ? { ...question, linkedBrickIds: [...question.linkedBrickIds, brickId] }
      : question,
  );
}

function appendSavedId(
  savedIds: readonly string[],
  brickId: string,
): readonly string[] {
  return savedIds.includes(brickId) ? savedIds : [...savedIds, brickId];
}

export function resolveCandidate(
  state: ResumeWritingLabState,
  candidate: LabExperienceCandidate,
  resolution: LabCandidateResolution,
): ResumeWritingLabState {
  if (resolution === "skip") return state;

  if (resolution === "create") {
    const brick: LabExperienceBrick = {
      id: `brick-${candidate.id}`,
      title: candidate.title,
      content: candidate.content,
      tags: candidate.tags,
      sourceQuestionId: candidate.sourceQuestionId,
    };
    const bricks = state.bricks.some((item) => item.id === brick.id)
      ? state.bricks
      : [...state.bricks, brick];
    return {
      ...state,
      bricks,
      questions: linkedQuestions(state, candidate, brick.id),
      sessionSavedBrickIds: appendSavedId(state.sessionSavedBrickIds, brick.id),
    };
  }

  const matchedBrickId = candidate.matchedBrickId;
  if (!matchedBrickId) return state;

  if (resolution === "link") {
    return {
      ...state,
      questions: linkedQuestions(state, candidate, matchedBrickId),
    };
  }

  return {
    ...state,
    bricks: state.bricks.map((brick) =>
      brick.id === matchedBrickId
        ? {
            ...brick,
            content: `${brick.content}\n\n보강 내용: ${candidate.content}`,
            tags: [...new Set([...brick.tags, ...candidate.tags])],
          }
        : brick,
    ),
    questions: linkedQuestions(state, candidate, matchedBrickId),
    sessionSavedBrickIds: appendSavedId(
      state.sessionSavedBrickIds,
      matchedBrickId,
    ),
  };
}
