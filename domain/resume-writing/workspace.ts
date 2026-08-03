export type ResumeWritingStage =
  | "COLLECT"
  | "PLAN"
  | "DRAFT"
  | "MEMORY_REVIEW"
  | "COMPLETE";

export type ResumeWritingQuestionState =
  | "not_started"
  | "drafting"
  | "completed";

export type ResumeWritingNextAction =
  | { readonly type: "add_questions" }
  | { readonly type: "draft_question"; readonly questionId: string }
  | { readonly type: "continue_question"; readonly questionId: string }
  | { readonly type: "review_experience_captures" }
  | { readonly type: "resolve_experience_capture_tasks" }
  | { readonly type: "review_application" };

type ResumeWritingBrickSource = "MANUAL" | "FILE_PARSE" | "AI_EXTRACT";

type ResumeWritingWorkspaceSource = {
  readonly application: {
    readonly id: string;
    readonly companyName: string;
    readonly jobTitle: string;
    readonly status: "WRITING" | "DONE" | "SUBMITTED" | "ARCHIVED";
  };
  readonly questions: readonly {
    readonly id: string;
    readonly order: number;
    readonly questionText: string;
    readonly charLimit: number | null;
    readonly answer: string | null;
    readonly isCompleted: boolean;
    readonly selectedBricks: readonly {
      readonly id: string;
      readonly source: ResumeWritingBrickSource;
    }[];
    readonly pendingCaptureCount: number;
  }[];
  readonly memory: {
    readonly availableBrickCount: number;
    readonly capturedFromWritingCount: number;
  };
  readonly pendingCaptureTaskCount?: number;
};

export type ResumeWritingWorkspace = {
  readonly id: string;
  readonly companyName: string;
  readonly jobTitle: string;
  readonly stage: ResumeWritingStage;
  readonly activeQuestionId: string | null;
  readonly progress: {
    readonly total: number;
    readonly completed: number;
    readonly percent: number;
  };
  readonly questions: readonly {
    readonly id: string;
    readonly position: number;
    readonly questionText: string;
    readonly charLimit: number | null;
    readonly answer: string;
    readonly state: ResumeWritingQuestionState;
    readonly selectedBrickCount: number;
    readonly pendingCaptureCount: number;
  }[];
  readonly productivity: {
    readonly availableBrickCount: number;
    readonly capturedFromWritingCount: number;
    readonly reusedBrickCount: number;
  };
  readonly pendingCaptureCount: number;
  readonly nextAction: ResumeWritingNextAction;
};

function getQuestionState(
  question: ResumeWritingWorkspaceSource["questions"][number],
): ResumeWritingQuestionState {
  if (question.isCompleted) return "completed";
  if (question.answer?.trim()) return "drafting";
  return "not_started";
}

function getStage(
  source: ResumeWritingWorkspaceSource,
  completedCount: number,
): ResumeWritingStage {
  if (source.questions.length === 0) return "COLLECT";
  if (
    source.application.status !== "DONE" &&
    source.application.status !== "SUBMITTED" &&
    completedCount === source.questions.length
  ) {
    return "MEMORY_REVIEW";
  }
  if (
    source.application.status === "DONE" ||
    source.application.status === "SUBMITTED"
  ) {
    return source.questions.some((question) => question.pendingCaptureCount > 0) ||
      (source.pendingCaptureTaskCount ?? 0) > 0
      ? "MEMORY_REVIEW"
      : "COMPLETE";
  }

  const hasWritingProgress = source.questions.some(
    (question) => question.isCompleted || Boolean(question.answer?.trim()),
  );
  return hasWritingProgress ? "DRAFT" : "PLAN";
}

function getNextAction(
  source: ResumeWritingWorkspaceSource,
  stage: ResumeWritingStage,
  pendingCaptureCount: number,
): ResumeWritingNextAction {
  if (source.questions.length === 0) return { type: "add_questions" };

  if (stage === "COMPLETE") {
    return { type: "review_application" };
  }
  if (stage === "MEMORY_REVIEW") {
    if (pendingCaptureCount > 0) {
      return { type: "review_experience_captures" };
    }
    if ((source.pendingCaptureTaskCount ?? 0) > 0) {
      return { type: "resolve_experience_capture_tasks" };
    }
    return { type: "review_application" };
  }

  const nextQuestion = source.questions.find((question) => !question.isCompleted);
  if (!nextQuestion) return { type: "review_application" };

  return nextQuestion.answer?.trim()
    ? { type: "continue_question", questionId: nextQuestion.id }
    : { type: "draft_question", questionId: nextQuestion.id };
}

export function projectResumeWritingWorkspace(
  source: ResumeWritingWorkspaceSource,
): ResumeWritingWorkspace {
  const orderedQuestions = [...source.questions].sort(
    (left, right) => left.order - right.order,
  );
  const completedCount = orderedQuestions.filter(
    (question) => question.isCompleted,
  ).length;
  const stage = getStage(source, completedCount);
  const pendingCaptureCount = orderedQuestions.reduce(
    (sum, question) => sum + question.pendingCaptureCount,
    0,
  );
  const usedBrickIds = new Set(
    orderedQuestions.flatMap((question) =>
      question.selectedBricks.map((brick) => brick.id),
    ),
  );
  const activeQuestion =
    stage === "COMPLETE" || stage === "MEMORY_REVIEW"
      ? null
      : orderedQuestions.find((question) => !question.isCompleted) ?? null;

  return {
    id: source.application.id,
    companyName: source.application.companyName,
    jobTitle: source.application.jobTitle,
    stage,
    activeQuestionId: activeQuestion?.id ?? null,
    progress: {
      total: orderedQuestions.length,
      completed: completedCount,
      percent:
        orderedQuestions.length === 0
          ? 0
          : Math.round((completedCount / orderedQuestions.length) * 100),
    },
    questions: orderedQuestions.map((question, index) => ({
      id: question.id,
      position: index + 1,
      questionText: question.questionText,
      charLimit: question.charLimit,
      answer: question.answer ?? "",
      state: getQuestionState(question),
      selectedBrickCount: question.selectedBricks.length,
      pendingCaptureCount: question.pendingCaptureCount,
    })),
    productivity: {
      availableBrickCount: source.memory.availableBrickCount,
      capturedFromWritingCount: source.memory.capturedFromWritingCount,
      reusedBrickCount: usedBrickIds.size,
    },
    pendingCaptureCount,
    nextAction: getNextAction(source, stage, pendingCaptureCount),
  };
}
