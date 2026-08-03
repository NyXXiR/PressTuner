import type { ResumeStructuredBrief } from "@/lib/services/resume/resumeBrief";
import type {
  CompleteResumeWritingQuestionResult,
  ResumeExperienceCaptureItem,
} from "./completion";

export type FlowStage = "intake" | "review" | "writing" | "capture" | "done";

export type FlowAsyncStatus = "idle" | "pending" | "error";

export type FlowBrick = {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
};

export type FlowMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly body: string;
};

export type FlowSuggestion = {
  readonly original: string;
  readonly revised: string;
  readonly instruction: string;
  readonly grounding: FlowGrounding | null;
};

export type FlowQuestionStatus =
  | "ready"
  | "drafted"
  | "revised"
  | "saved"
  | "completed";

export type FlowGrounding = {
  readonly id: string;
  readonly experienceIds: readonly string[];
  readonly factIds: readonly string[];
  readonly experiences: readonly {
    readonly experienceId: string;
    readonly title: string;
    readonly organization: string | null;
    readonly roleTitle: string | null;
  }[];
  readonly facts: readonly {
    readonly factId: string;
    readonly kind: string;
    readonly fieldPath: string;
    readonly value: string;
    readonly active: boolean;
    readonly trustStatus: string;
    readonly evidence: readonly {
      readonly documentName: string;
      readonly excerpt: string;
      readonly pageStart: number | null;
      readonly pageEnd: number | null;
    }[];
  }[];
};

export type FlowVerificationFinding = {
  readonly id: string;
  readonly type: "SUPPORTED" | "CONTRADICTION" | "UNSUPPORTED";
  readonly riskCategory: "NUMBER" | "DATE" | "ORGANIZATION" | "TITLE" | "OTHER";
  readonly claim: string;
  readonly explanation: string;
  readonly supportingFactIds: readonly string[];
  readonly supportingFacts?: readonly {
    readonly factId: string;
    readonly kind: string;
    readonly value: string;
    readonly fieldPath: string;
    readonly experience: {
      readonly title: string;
      readonly organization: string | null;
      readonly roleTitle: string | null;
    };
    readonly evidence: readonly {
      readonly documentName: string;
      readonly excerpt: string;
      readonly pageStart: number | null;
      readonly pageEnd: number | null;
    }[];
  }[];
};

export type FlowVerification = {
  readonly id: string;
  readonly result: "PASS" | "WARN" | "BLOCK";
  readonly findings: readonly FlowVerificationFinding[];
};

export type FlowDraftStatus = "idle" | "generating" | "ready" | "error";

export type FlowQuestion = {
  readonly id: string;
  readonly prompt: string;
  readonly charLimit: number;
  readonly answer: string;
  readonly status: FlowQuestionStatus;
  readonly aiAdvice: string;
  readonly draftStatus: FlowDraftStatus;
  readonly draftError: string | null;
  readonly linkedBrickIds: readonly string[];
  readonly messages: readonly FlowMessage[];
  readonly pendingPrompt: string | null;
  readonly pendingSuggestion: FlowSuggestion | null;
  readonly suggestionStatus: FlowAsyncStatus;
  readonly suggestionError: string | null;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly revisionCount: number;
  readonly deferredCapture: boolean;
  readonly grounding: FlowGrounding | null;
  readonly verification: FlowVerification | null;
};

export type FlowCaptureResult = CompleteResumeWritingQuestionResult["capture"];

export type FlowCaptureStatus = "pending" | "applying" | "applied" | "dismissed";

export type FlowCapture = {
  readonly captureId: string;
  readonly questionId: string;
  readonly summary: string;
  readonly items: readonly ResumeExperienceCaptureItem[];
  readonly selectedPreviewIds: readonly string[];
  readonly status: FlowCaptureStatus;
  readonly error: string | null;
};

export type FlowDeferredCaptureTask = {
  readonly taskId: string;
  readonly questionId: string;
  readonly status: "retrying" | "needs_attention";
  readonly attemptCount: number;
  readonly nextRetryAt: string | null;
  readonly lastErrorCode: string | null;
  readonly requiresReopen: boolean;
  readonly retryStatus: FlowAsyncStatus;
  readonly error: string | null;
};

export type FlowMemoryReadiness = {
  readonly status:
    | "READY"
    | "PROCESSING"
    | "REVIEW_REQUIRED"
    | "EMPTY"
    | "FAILED";
  readonly confirmedExperienceCount: number;
  readonly trustedFactCount: number;
  readonly pendingCandidateCount: number;
  readonly processingSourceCount: number;
  readonly recoveryHref: "/resume/bricks";
};

export type FlowProductivity = {
  readonly availableBrickCount: number;
  readonly capturedFromWritingCount: number;
  readonly reusedBrickCount: number;
};

export type FlowOrganizedIntake = {
  readonly company: string;
  readonly job: string;
  readonly brief: ResumeStructuredBrief;
  readonly questions: readonly {
    readonly prompt: string;
    readonly charLimit: number;
  }[];
};

export type FlowServerQuestion = {
  readonly id: string;
  readonly prompt: string;
  readonly charLimit: number;
  readonly aiAdvice: string;
  readonly linkedBrickIds: readonly string[];
};

export type ResumeWriteFlowState = {
  readonly schemaVersion: 3;
  readonly stage: FlowStage;
  readonly intake: { readonly rawText: string; readonly postingUrl: string };
  readonly organize: {
    readonly status: FlowAsyncStatus;
    readonly error: string | null;
  };
  readonly company: string;
  readonly job: string;
  readonly brief: ResumeStructuredBrief;
  readonly direction: string;
  readonly userBricks: readonly FlowBrick[];
  readonly pinnedBrickIds: readonly string[];
  readonly appId: string | null;
  readonly start: {
    readonly status: FlowAsyncStatus;
    readonly error: string | null;
  };
  readonly questions: readonly FlowQuestion[];
  readonly activeQuestionId: string | null;
  readonly captures: readonly FlowCapture[];
  readonly deferredCaptures: readonly FlowDeferredCaptureTask[];
  readonly memoryReadiness: FlowMemoryReadiness | null;
  readonly productivity: FlowProductivity | null;
  readonly finish: {
    readonly status: FlowAsyncStatus;
    readonly error: string | null;
  };
  readonly notice: string | null;
};

export type ResumeWriteFlowAction =
  | { readonly type: "restore_session"; readonly state: ResumeWriteFlowState }
  | {
      readonly type: "update_intake";
      readonly field: "rawText" | "postingUrl";
      readonly value: string;
    }
  | { readonly type: "organize_started" }
  | { readonly type: "organize_succeeded"; readonly result: FlowOrganizedIntake }
  | { readonly type: "organize_failed"; readonly error: string }
  | { readonly type: "back_to_intake" }
  | {
      readonly type: "update_target";
      readonly field: "company" | "job" | "summary";
      readonly value: string;
    }
  | {
      readonly type: "update_question_prompt";
      readonly questionId: string;
      readonly value: string;
    }
  | {
      readonly type: "update_question_limit";
      readonly questionId: string;
      readonly value: number;
    }
  | { readonly type: "add_question" }
  | { readonly type: "remove_question"; readonly questionId: string }
  | { readonly type: "update_direction"; readonly value: string }
  | { readonly type: "bricks_loaded"; readonly bricks: readonly FlowBrick[] }
  | { readonly type: "toggle_pinned_brick"; readonly brickId: string }
  | { readonly type: "start_started" }
  | {
      readonly type: "start_succeeded";
      readonly appId: string;
      readonly questions: readonly FlowServerQuestion[];
    }
  | { readonly type: "start_failed"; readonly error: string }
  | { readonly type: "draft_started"; readonly questionId: string }
  | {
      readonly type: "draft_succeeded";
      readonly questionId: string;
      readonly text: string;
      readonly grounding?: FlowGrounding | null;
    }
  | {
      readonly type: "draft_failed";
      readonly questionId: string;
      readonly error: string;
    }
  | { readonly type: "select_question"; readonly questionId: string }
  | {
      readonly type: "toggle_brick_link";
      readonly questionId: string;
      readonly brickId: string;
    }
  | { readonly type: "update_answer"; readonly value: string }
  | { readonly type: "prompt_sent"; readonly prompt: string }
  | {
      readonly type: "suggestion_received";
      readonly questionId: string;
      readonly revised: string;
      readonly grounding?: FlowGrounding | null;
    }
  | {
      readonly type: "suggestion_failed";
      readonly questionId: string;
      readonly error: string;
    }
  | { readonly type: "apply_suggestion" }
  | { readonly type: "discard_suggestion" }
  | { readonly type: "save_started"; readonly questionId: string }
  | { readonly type: "save_succeeded"; readonly questionId: string }
  | {
      readonly type: "save_failed";
      readonly questionId: string;
      readonly error: string;
    }
  | { readonly type: "complete_started"; readonly questionId: string }
  | {
      readonly type: "complete_succeeded";
      readonly questionId: string;
      readonly capture: FlowCaptureResult;
      readonly verification?: FlowVerification | null;
    }
  | {
      readonly type: "complete_failed";
      readonly questionId: string;
      readonly error: string;
      readonly verification?: FlowVerification | null;
    }
  | { readonly type: "reopen_question"; readonly questionId: string }
  | { readonly type: "goto_capture" }
  | {
      readonly type: "toggle_capture_item";
      readonly captureId: string;
      readonly previewId: string;
    }
  | { readonly type: "capture_apply_started"; readonly captureId: string }
  | {
      readonly type: "capture_resolved";
      readonly captureId: string;
      readonly action: "apply" | "dismiss";
    }
  | {
      readonly type: "capture_failed";
      readonly captureId: string;
      readonly error: string;
    }
  | { readonly type: "capture_retry_started"; readonly taskId: string }
  | {
      readonly type: "capture_retry_deferred";
      readonly task: FlowDeferredCaptureTask;
    }
  | {
      readonly type: "capture_retry_succeeded";
      readonly taskId: string;
      readonly questionId: string;
      readonly capture: FlowCaptureResult;
    }
  | {
      readonly type: "capture_retry_failed";
      readonly taskId: string;
      readonly error: string;
      readonly requiresReopen?: boolean;
    }
  | {
      readonly type: "finish_started";
    }
  | {
      readonly type: "finish_failed";
      readonly error: string;
    }
  | {
      readonly type: "finish_succeeded";
      readonly productivity: FlowProductivity | null;
    }
  | { readonly type: "dismiss_notice" }
  | { readonly type: "reset" };

class UnexpectedFlowActionError extends Error {
  constructor(readonly action: never) {
    super("Unexpected resume write flow action");
    this.name = "UnexpectedFlowActionError";
  }
}

function emptyBrief(): ResumeStructuredBrief {
  return {
    summary: "",
    deadline: null,
    employmentType: null,
    location: null,
    coreResponsibilities: [],
    requirements: [],
    preferredQualifications: [],
    keySignals: [],
    writingGuidance: [],
  };
}

function createFlowQuestion(
  id: string,
  prompt: string,
  charLimit: number,
): FlowQuestion {
  return {
    id,
    prompt,
    charLimit,
    answer: "",
    status: "ready",
    aiAdvice: "",
    draftStatus: "idle",
    draftError: null,
    linkedBrickIds: [],
    messages: [],
    pendingPrompt: null,
    pendingSuggestion: null,
    suggestionStatus: "idle",
    suggestionError: null,
    saving: false,
    saveError: null,
    revisionCount: 0,
    deferredCapture: false,
    grounding: null,
    verification: null,
  };
}

export function createResumeWriteFlowState(): ResumeWriteFlowState {
  return {
    schemaVersion: 3,
    stage: "intake",
    intake: { rawText: "", postingUrl: "" },
    organize: { status: "idle", error: null },
    company: "",
    job: "",
    brief: emptyBrief(),
    direction: "",
    userBricks: [],
    pinnedBrickIds: [],
    appId: null,
    start: { status: "idle", error: null },
    questions: [],
    activeQuestionId: null,
    captures: [],
    deferredCaptures: [],
    memoryReadiness: null,
    productivity: null,
    finish: { status: "idle", error: null },
    notice: null,
  };
}

function updateQuestion(
  state: ResumeWriteFlowState,
  questionId: string | null,
  update: (question: FlowQuestion) => FlowQuestion,
): readonly FlowQuestion[] {
  return state.questions.map((question) =>
    question.id === questionId ? update(question) : question,
  );
}

function appendMessage(
  question: FlowQuestion,
  role: FlowMessage["role"],
  body: string,
): readonly FlowMessage[] {
  return [
    ...question.messages,
    { id: `${question.id}-m${question.messages.length}-${role}`, role, body },
  ];
}

function nextQuestionId(questionId: string, questions: readonly FlowQuestion[]) {
  return (
    questions.find((question) => question.status !== "completed")?.id ??
    questionId
  );
}

function allCompleted(state: ResumeWriteFlowState): boolean {
  return (
    state.questions.length > 0 &&
    state.questions.every((question) => question.status === "completed")
  );
}

function canStartReview(state: ResumeWriteFlowState): boolean {
  return Boolean(
    state.company.trim() &&
      state.job.trim() &&
      state.questions.some((question) => question.prompt.trim()),
  );
}

export function selectCanConfirmReview(state: ResumeWriteFlowState): boolean {
  return state.stage === "review" && canStartReview(state);
}

export function selectCompletedCount(state: ResumeWriteFlowState): number {
  return state.questions.filter((question) => question.status === "completed")
    .length;
}

export function selectPendingCaptures(
  state: ResumeWriteFlowState,
): readonly FlowCapture[] {
  return state.captures.filter(
    (capture) => capture.status === "pending" || capture.status === "applying",
  );
}

export function selectPendingCaptureForQuestion(
  state: ResumeWriteFlowState,
  questionId: string,
): FlowCapture | null {
  return (
    selectPendingCaptures(state).find(
      (capture) => capture.questionId === questionId,
    ) ?? null
  );
}

export function selectAppliedBrickDelta(state: ResumeWriteFlowState): number {
  return state.captures
    .filter((capture) => capture.status === "applied")
    .reduce((sum, capture) => sum + capture.selectedPreviewIds.length, 0);
}

export function selectCanFinishFromWriting(
  state: ResumeWriteFlowState,
): boolean {
  return (
    state.stage === "writing" &&
    allCompleted(state) &&
    selectPendingCaptures(state).length === 0
  );
}

export function resumeWriteFlowReducer(
  state: ResumeWriteFlowState,
  action: ResumeWriteFlowAction,
): ResumeWriteFlowState {
  switch (action.type) {
    case "restore_session":
      return action.state;
    case "update_intake":
      return state.stage === "intake"
        ? {
            ...state,
            intake: { ...state.intake, [action.field]: action.value },
            organize: { status: "idle", error: null },
          }
        : state;
    case "organize_started":
      return state.stage === "intake"
        ? { ...state, organize: { status: "pending", error: null } }
        : state;
    case "organize_succeeded": {
      if (state.stage !== "intake") return state;
      return {
        ...state,
        stage: "review",
        organize: { status: "idle", error: null },
        company: action.result.company,
        job: action.result.job,
        brief: action.result.brief,
        questions: action.result.questions.map((question, index) =>
          createFlowQuestion(
            `draft-q-${index + 1}`,
            question.prompt,
            question.charLimit,
          ),
        ),
        notice: "문항을 정리했어요. 내용을 확인하고 다듬어 주세요.",
      };
    }
    case "organize_failed":
      return state.stage === "intake"
        ? { ...state, organize: { status: "error", error: action.error } }
        : state;
    case "back_to_intake":
      return state.stage === "review" ? { ...state, stage: "intake" } : state;
    case "update_target": {
      if (state.stage !== "review") return state;
      if (action.field === "summary") {
        return { ...state, brief: { ...state.brief, summary: action.value } };
      }
      return { ...state, [action.field]: action.value };
    }
    case "update_question_prompt":
      return state.stage === "review"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              prompt: action.value,
            })),
          }
        : state;
    case "update_question_limit":
      return state.stage === "review"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              charLimit: Math.min(3_000, Math.max(100, action.value || 100)),
            })),
          }
        : state;
    case "add_question": {
      if (state.stage !== "review") return state;
      const index =
        state.questions.reduce(
          (largest, question) =>
            Math.max(largest, Number(question.id.split("-").at(-1)) || 0),
          0,
        ) + 1;
      return {
        ...state,
        questions: [
          ...state.questions,
          createFlowQuestion(`draft-q-${index}`, "", 700),
        ],
      };
    }
    case "remove_question":
      return state.stage === "review" && state.questions.length > 1
        ? {
            ...state,
            questions: state.questions.filter(
              (question) => question.id !== action.questionId,
            ),
          }
        : state;
    case "update_direction":
      return state.stage === "review"
        ? { ...state, direction: action.value }
        : state;
    case "bricks_loaded":
      return { ...state, userBricks: action.bricks };
    case "toggle_pinned_brick":
      return state.stage === "review"
        ? {
            ...state,
            pinnedBrickIds: state.pinnedBrickIds.includes(action.brickId)
              ? state.pinnedBrickIds.filter((id) => id !== action.brickId)
              : [...state.pinnedBrickIds, action.brickId],
          }
        : state;
    case "start_started":
      return state.stage === "review" && canStartReview(state)
        ? { ...state, start: { status: "pending", error: null } }
        : state;
    case "start_succeeded": {
      if (state.stage !== "review") return state;
      const questions = action.questions.map((question) => ({
        ...createFlowQuestion(question.id, question.prompt, question.charLimit),
        aiAdvice: question.aiAdvice,
        linkedBrickIds: question.linkedBrickIds,
      }));
      return {
        ...state,
        stage: "writing",
        start: { status: "idle", error: null },
        appId: action.appId,
        questions,
        activeQuestionId: questions[0]?.id ?? null,
        notice: null,
      };
    }
    case "start_failed":
      return state.stage === "review"
        ? { ...state, start: { status: "error", error: action.error } }
        : state;
    case "draft_started":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              draftStatus: "generating",
              draftError: null,
            })),
          }
        : state;
    case "draft_succeeded":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) =>
              question.status === "completed"
                ? question
                : {
                    ...question,
                    answer: action.text,
                    status: "drafted",
                    draftStatus: "ready",
                    draftError: null,
                    grounding: action.grounding ?? null,
                    verification: null,
                    messages: appendMessage(
                      question,
                      "assistant",
                      "공고와 연결 경험을 바탕으로 초안을 만들었어요. 원하는 수정 방향을 말해 주세요.",
                    ),
                  },
            ),
          }
        : state;
    case "draft_failed":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              draftStatus: "error",
              draftError: action.error,
            })),
          }
        : state;
    case "select_question":
      return state.stage === "writing" &&
        state.questions.some((question) => question.id === action.questionId)
        ? { ...state, activeQuestionId: action.questionId }
        : state;
    case "toggle_brick_link":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) =>
              question.status === "completed"
                ? question
                : {
                    ...question,
                    linkedBrickIds: question.linkedBrickIds.includes(
                      action.brickId,
                    )
                      ? question.linkedBrickIds.filter(
                          (id) => id !== action.brickId,
                        )
                      : [...question.linkedBrickIds, action.brickId],
                  },
            ),
          }
        : state;
    case "update_answer":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, state.activeQuestionId, (question) =>
              question.status === "completed"
                ? question
                : {
                    ...question,
                    answer: action.value,
                    status:
                      question.status === "ready" ? "drafted" : "revised",
                    grounding: null,
                    verification: null,
                  },
            ),
          }
        : state;
    case "prompt_sent": {
      if (state.stage !== "writing" || !action.prompt.trim()) return state;
      return {
        ...state,
        questions: updateQuestion(state, state.activeQuestionId, (question) => {
          if (!question.answer.trim() || question.status === "completed") {
            return question;
          }
          return {
            ...question,
            pendingPrompt: action.prompt.trim(),
            suggestionStatus: "pending",
            suggestionError: null,
            messages: appendMessage(question, "user", action.prompt.trim()),
          };
        }),
      };
    }
    case "suggestion_received":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              suggestionStatus: "idle",
              pendingSuggestion: {
                original: question.answer,
                revised: action.revised,
                instruction: question.pendingPrompt ?? "",
                grounding: action.grounding ?? null,
              },
              pendingPrompt: null,
              messages: appendMessage(
                question,
                "assistant",
                "요청을 반영한 수정안을 만들었어요. 비교 후 적용해 주세요.",
              ),
            })),
          }
        : state;
    case "suggestion_failed":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              suggestionStatus: "error",
              suggestionError: action.error,
              pendingPrompt: null,
            })),
          }
        : state;
    case "apply_suggestion":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, state.activeQuestionId, (question) =>
              question.pendingSuggestion
                ? {
                    ...question,
                    answer: question.pendingSuggestion.revised,
                    pendingSuggestion: null,
                    status: "revised",
                    revisionCount: question.revisionCount + 1,
                    grounding: question.pendingSuggestion.grounding,
                    verification: null,
                  }
                : question,
            ),
          }
        : state;
    case "discard_suggestion":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, state.activeQuestionId, (question) => ({
              ...question,
              pendingSuggestion: null,
            })),
          }
        : state;
    case "save_started":
    case "complete_started":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              saving: true,
              saveError: null,
            })),
          }
        : state;
    case "save_succeeded":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              saving: false,
              status: question.status === "completed" ? question.status : "saved",
              pendingSuggestion: null,
            })),
            notice: "현재 문항을 저장했습니다.",
          }
        : state;
    case "save_failed":
    case "complete_failed":
      return state.stage === "writing"
        ? {
            ...state,
            questions: updateQuestion(state, action.questionId, (question) => ({
              ...question,
              saving: false,
              saveError: action.error,
              verification:
                action.type === "complete_failed"
                  ? action.verification ?? question.verification
                  : question.verification,
            })),
          }
        : state;
    case "complete_succeeded": {
      if (state.stage !== "writing") return state;
      const questions = updateQuestion(state, action.questionId, (question) => ({
        ...question,
        saving: false,
        status: "completed" as const,
        pendingSuggestion: null,
        deferredCapture: action.capture.kind === "deferred",
        verification: action.verification ?? question.verification,
      }));
      const captures =
        action.capture.kind === "pending_approval"
          ? [
              ...state.captures,
              {
                captureId: action.capture.captureId,
                questionId: action.questionId,
                summary: action.capture.summary,
                items: action.capture.items,
                selectedPreviewIds: action.capture.items.map(
                  (item) => item.previewId,
                ),
                status: "pending" as const,
                error: null,
              },
            ]
          : state.captures;
      const next = nextQuestionId(action.questionId, questions);
      const finished = questions.every(
        (question) => question.status === "completed",
      );
      return {
        ...state,
        questions,
        captures,
        activeQuestionId: next,
        notice: finished
          ? "모든 문항이 완료되었습니다. 경험 추출로 넘어가세요."
          : action.capture.kind === "pending_approval"
            ? action.capture.summary
            : "문항을 완료하고 다음 문항으로 이동했습니다.",
      };
    }
    case "reopen_question":
      return state.stage === "writing"
        ? {
            ...state,
            activeQuestionId: action.questionId,
            questions: updateQuestion(state, action.questionId, (question) =>
              question.status === "completed"
                ? { ...question, status: "saved" }
                : question,
            ),
          }
        : state;
    case "goto_capture":
      return state.stage === "writing" && allCompleted(state)
        ? { ...state, stage: "capture", notice: null }
        : state;
    case "toggle_capture_item":
      return {
        ...state,
        captures: state.captures.map((capture) =>
          capture.captureId === action.captureId && capture.status === "pending"
            ? {
                ...capture,
                selectedPreviewIds: capture.selectedPreviewIds.includes(
                  action.previewId,
                )
                  ? capture.selectedPreviewIds.filter(
                      (id) => id !== action.previewId,
                    )
                  : [...capture.selectedPreviewIds, action.previewId],
              }
            : capture,
        ),
      };
    case "capture_apply_started":
      return {
        ...state,
        captures: state.captures.map((capture) =>
          capture.captureId === action.captureId
            ? { ...capture, status: "applying", error: null }
            : capture,
        ),
      };
    case "capture_resolved":
      return {
        ...state,
        captures: state.captures.map((capture) =>
          capture.captureId === action.captureId
            ? {
                ...capture,
                status: action.action === "apply" ? "applied" : "dismissed",
                error: null,
              }
            : capture,
        ),
      };
    case "capture_failed":
      return {
        ...state,
        captures: state.captures.map((capture) =>
          capture.captureId === action.captureId
            ? { ...capture, status: "pending", error: action.error }
            : capture,
        ),
      };
    case "capture_retry_started":
      return {
        ...state,
        deferredCaptures: state.deferredCaptures.map((task) =>
          task.taskId === action.taskId
            ? { ...task, retryStatus: "pending", error: null }
            : task,
        ),
      };
    case "capture_retry_deferred":
      return {
        ...state,
        deferredCaptures: state.deferredCaptures.map((task) =>
          task.taskId === action.task.taskId ? action.task : task,
        ),
      };
    case "capture_retry_succeeded": {
      const successfulCapture =
        action.capture.kind === "pending_approval" ? action.capture : null;
      const captures =
        successfulCapture
          ? [
              ...state.captures.filter(
                (capture) => capture.captureId !== successfulCapture.captureId,
              ),
              {
                captureId: successfulCapture.captureId,
                questionId: action.questionId,
                summary: successfulCapture.summary,
                items: successfulCapture.items,
                selectedPreviewIds: successfulCapture.items.map((item) => item.previewId),
                status: "pending" as const,
                error: null,
              },
            ]
          : state.captures;
      return {
        ...state,
        captures,
        deferredCaptures: state.deferredCaptures.filter(
          (task) => task.taskId !== action.taskId,
        ),
        stage:
          successfulCapture && state.stage === "done"
            ? "capture"
            : state.stage,
      };
    }
    case "capture_retry_failed":
      return {
        ...state,
        deferredCaptures: state.deferredCaptures.map((task) =>
          task.taskId === action.taskId
            ? {
                ...task,
                retryStatus: "error",
                error: action.error,
                requiresReopen: action.requiresReopen ?? task.requiresReopen,
              }
            : task,
        ),
      };
    case "finish_started":
      return state.stage === "capture" || state.stage === "writing"
        ? {
            ...state,
            finish: { status: "pending", error: null },
          }
        : state;
    case "finish_failed":
      return state.stage === "capture" || state.stage === "writing"
        ? {
            ...state,
            finish: { status: "error", error: action.error },
          }
        : state;
    case "finish_succeeded":
      return state.stage === "capture" || state.stage === "writing"
        ? {
            ...state,
            stage: "done",
            productivity: action.productivity,
            finish: { status: "idle", error: null },
            notice: null,
          }
        : state;
    case "dismiss_notice":
      return { ...state, notice: null };
    case "reset":
      return createResumeWriteFlowState();
    default:
      throw new UnexpectedFlowActionError(action);
  }
}
