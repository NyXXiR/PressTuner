"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  createResumeWriteFlowState,
  resumeWriteFlowReducer,
  type ResumeWriteFlowAction,
  type ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";
import {
  parseResumeWriteFlowState,
  resumeWriteFlowStorageKey,
  serializeResumeWriteFlowState,
} from "@/domain/resume-writing/flowPersistence";

import { createResumeWriteFlowTutorialState } from "./flowPreviewState";

import { FlowApiError, resumeWriteFlowApi } from "./flowApi";
import {
  completeReadyApplication,
  saveThenCompleteQuestion,
  startIntakeWithBricks,
  startWorkspaceWithFirstDraft,
} from "@/lib/resume/resumeWriteFlowOrchestration";

const {
  fetchProductivity,
  generateDraft,
  loadExistingApplication,
  overrideVerification,
  requestRevision,
  retryDeferredCapture,
  resolveCapture,
  saveQuestionAnswer,
} = resumeWriteFlowApi;

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type DraftTarget = {
  readonly id: string;
  readonly prompt: string;
  readonly charLimit: number;
  readonly aiAdvice: string;
  readonly linkedBrickIds: readonly string[];
};

function draftInstruction(direction: string, aiAdvice: string): string {
  return [direction, aiAdvice]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export type WriteFlowCommands = {
  readonly organize: () => Promise<void>;
  readonly start: () => Promise<void>;
  readonly regenerateDraft: (questionId: string) => Promise<void>;
  readonly sendPrompt: (prompt: string) => Promise<void>;
  readonly saveQuestion: (questionId: string) => Promise<void>;
  readonly completeCurrentQuestion: (questionId: string) => Promise<void>;
  readonly reopenQuestion: (questionId: string) => Promise<void>;
  readonly overrideQuestion: (
    questionId: string,
    verificationId: string,
    reason: string,
  ) => Promise<void>;
  readonly applyCapture: (captureId: string) => Promise<void>;
  readonly dismissCapture: (captureId: string) => Promise<void>;
  readonly retryCapture: (taskId: string, reopenApplication?: boolean) => Promise<void>;
  readonly finish: () => Promise<void>;
  readonly resetFlow: () => void;
};

export function useWriteFlow(
  initialAppId?: string,
  isTutorial?: boolean,
): {
  readonly state: ResumeWriteFlowState;
  readonly dispatch: (action: ResumeWriteFlowAction) => void;
  readonly hydrated: boolean;
  readonly commands: WriteFlowCommands;
} {
  const [state, dispatch] = useReducer(
    resumeWriteFlowReducer,
    undefined,
    createResumeWriteFlowState,
  );
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  const appIdRef = useRef(initialAppId ?? null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state.appId) appIdRef.current = state.appId;
  }, [state.appId]);

  useEffect(() => {
    const serialized = window.sessionStorage.getItem(
      resumeWriteFlowStorageKey(appIdRef.current),
    );
    const restored = serialized ? parseResumeWriteFlowState(serialized) : null;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (isTutorial) {
        dispatch({
          type: "restore_session",
          state: createResumeWriteFlowTutorialState(),
        });
        setHydrated(true);
        return;
      }
      if (restored) {
        dispatch({ type: "restore_session", state: restored });
        setHydrated(true);
        return;
      }
      if (initialAppId) {
        loadExistingApplication(initialAppId)
          .then((loaded) => {
            if (!active) return;
            dispatch({ type: "restore_session", state: loaded });
          })
          .catch(() => {
            // 로드에 실패하면 기본 상태로 진행합니다.
          })
          .finally(() => {
            if (active) setHydrated(true);
          });
        return;
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [initialAppId, isTutorial]);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(
      resumeWriteFlowStorageKey(appIdRef.current),
      serializeResumeWriteFlowState(state),
    );
  }, [hydrated, state]);

  // start() 직후에는 stateRef가 아직 start_succeeded 이전 상태라서,
  // 생성 대상 문항 데이터는 항상 인자로 직접 받는다.
  const runDraft = useCallback(async (target: DraftTarget) => {
    const current = stateRef.current;
    const questionId = target.id;
    dispatch({ type: "draft_started", questionId });
    try {
      const result = await generateDraft({
        questionId,
        instruction: draftInstruction(current.direction, target.aiAdvice),
        charLimit: target.charLimit,
      });
      dispatch({
        type: "draft_succeeded",
        questionId,
        text: result.text,
        grounding: result.grounding,
      });
    } catch (error) {
      dispatch({
        type: "draft_failed",
        questionId,
        error: toErrorMessage(error, "초안 생성에 실패했습니다."),
      });
    }
  }, []);

  const generateFor = useCallback(
    async (questionId: string) => {
      const question = stateRef.current.questions.find(
        (item) => item.id === questionId,
      );
      if (!question || question.status === "completed") return;
      await runDraft(question);
    },
    [runDraft],
  );

  const retryCapture = useCallback(
    async (taskId: string, reopenApplication = false) => {
      const current = stateRef.current;
      const appId = current.appId;
      const task = current.deferredCaptures.find((item) => item.taskId === taskId);
      if (!appId || !task) return;
      dispatch({ type: "capture_retry_started", taskId });
      try {
        const capture = await retryDeferredCapture({
          appId,
          taskId,
          reopenApplication,
        });
        if (capture.kind === "deferred") {
          if (
            !capture.taskId ||
            !capture.status ||
            capture.attemptCount === undefined
          ) {
            throw new Error("경력 기억 추출 작업 정보를 받지 못했습니다.");
          }
          dispatch({
            type: "capture_retry_deferred",
            task: {
              taskId: capture.taskId,
              questionId: task.questionId,
              status: capture.status,
              attemptCount: capture.attemptCount,
              nextRetryAt: capture.nextRetryAt ?? null,
              lastErrorCode: capture.reason,
              requiresReopen: false,
              retryStatus: "idle",
              error: null,
            },
          });
          return;
        }
        dispatch({
          type: "capture_retry_succeeded",
          taskId,
          questionId: task.questionId,
          capture,
        });
      } catch (error) {
        dispatch({
          type: "capture_retry_failed",
          taskId,
          error: toErrorMessage(error, "경력 기억 추출 재시도에 실패했습니다."),
          requiresReopen:
            error instanceof FlowApiError &&
            error.code === "APPLICATION_REOPEN_REQUIRED",
        });
      }
    },
    [],
  );

  const organize = useCallback(async () => {
    const current = stateRef.current;
    if (!current.intake.rawText.trim() && !current.intake.postingUrl.trim()) {
      return;
    }
    dispatch({ type: "organize_started" });
    try {
      const result = await startIntakeWithBricks({
        api: resumeWriteFlowApi,
        intake: current.intake,
        onBricksLoaded: (bricks) =>
          dispatch({ type: "bricks_loaded", bricks }),
      });
      dispatch({ type: "organize_succeeded", result: result.organized });
    } catch (error) {
      dispatch({
        type: "organize_failed",
        error: toErrorMessage(error, "채용 정보 정리에 실패했습니다."),
      });
    }
  }, []);

  const start = useCallback(async () => {
    const current = stateRef.current;
    dispatch({ type: "start_started" });
    try {
      await startWorkspaceWithFirstDraft({
        api: resumeWriteFlowApi,
        workspace: {
          company: current.company,
          job: current.job,
          brief: current.brief,
          questions: current.questions.map((question) => ({
            prompt: question.prompt,
            charLimit: question.charLimit,
          })),
        },
        instructionFor: (question) =>
          draftInstruction(current.direction, question.aiAdvice),
        onWorkspaceCreated: (workspace) =>
          dispatch({
            type: "start_succeeded",
            appId: workspace.appId,
            questions: workspace.questions,
          }),
        onFirstDraftStarted: (questionId) =>
          dispatch({ type: "draft_started", questionId }),
        onFirstDraftSucceeded: (questionId, draft) =>
          dispatch({
            type: "draft_succeeded",
            questionId,
            text: draft.text,
            grounding: draft.grounding,
          }),
        onFirstDraftFailed: (questionId, error) =>
          dispatch({
            type: "draft_failed",
            questionId,
            error: toErrorMessage(error, "초안 생성에 실패했습니다."),
          }),
      });
    } catch (error) {
      dispatch({
        type: "start_failed",
        error: toErrorMessage(error, "작성 시작에 실패했습니다."),
      });
    }
  }, []);

  // 지연 초안 생성: 아직 초안이 없는 문항을 열면 그때 생성한다.
  // 실패(error) 상태는 자동 재시도하지 않고 사용자의 '다시 시도'에 맡긴다.
  useEffect(() => {
    if (!hydrated || state.stage !== "writing") return;
    const question = state.questions.find(
      (item) => item.id === state.activeQuestionId,
    );
    if (
      !question ||
      question.status !== "ready" ||
      question.draftStatus !== "idle" ||
      question.answer.trim()
    ) {
      return;
    }
    void runDraft(question);
  }, [hydrated, state.stage, state.activeQuestionId, state.questions, runDraft]);

  const sendPrompt = useCallback(async (prompt: string) => {
    const current = stateRef.current;
    const question = current.questions.find(
      (item) => item.id === current.activeQuestionId,
    );
    if (
      !question ||
      !prompt.trim() ||
      !question.answer.trim() ||
      question.status === "completed"
    ) {
      return;
    }

    dispatch({ type: "prompt_sent", prompt });
    try {
      const result = await requestRevision({
        questionId: question.id,
        originalText: question.answer,
        instruction: prompt.trim(),
        charLimit: question.charLimit,
      });
      dispatch({
        type: "suggestion_received",
        questionId: question.id,
        revised: result.text,
        grounding: result.grounding,
      });
    } catch (error) {
      dispatch({
        type: "suggestion_failed",
        questionId: question.id,
        error: toErrorMessage(error, "수정안 생성에 실패했습니다."),
      });
    }
  }, []);

  const saveQuestion = useCallback(async (questionId: string) => {
    const question = stateRef.current.questions.find(
      (item) => item.id === questionId,
    );
    if (!question || !question.answer.trim()) return;

    dispatch({ type: "save_started", questionId });
    try {
      await saveQuestionAnswer({
        questionId,
        answer: question.answer,
        isCompleted: false,
      });
      dispatch({ type: "save_succeeded", questionId });
    } catch (error) {
      dispatch({
        type: "save_failed",
        questionId,
        error: toErrorMessage(error, "문항 저장에 실패했습니다."),
      });
    }
  }, []);

  const completeCurrentQuestion = useCallback(async (questionId: string) => {
    const current = stateRef.current;
    const question = current.questions.find((item) => item.id === questionId);
    if (!current.appId || !question || !question.answer.trim()) return;

    dispatch({ type: "complete_started", questionId });
    try {
      const { completed: result } = await saveThenCompleteQuestion({
        api: resumeWriteFlowApi,
        appId: current.appId,
        questionId,
        answer: question.answer,
      });
      dispatch({
        type: "complete_succeeded",
        questionId,
        capture: result.capture,
        verification: result.verification,
      });
    } catch (error) {
      const details =
        error instanceof FlowApiError &&
        error.code === "CAREER_VERIFICATION_BLOCKED" &&
        error.details &&
        typeof error.details === "object"
          ? (error.details as {
              verificationId?: string;
              result?: "BLOCK";
              findings?: Array<{
                id: string;
                type: "SUPPORTED" | "CONTRADICTION" | "UNSUPPORTED";
                riskCategory: "NUMBER" | "DATE" | "ORGANIZATION" | "TITLE" | "OTHER";
                claim: string;
                explanation: string;
                supportingFactIds: string[];
              }>;
            })
          : null;
      dispatch({
        type: "complete_failed",
        questionId,
        error: toErrorMessage(error, "문항 완료 처리에 실패했습니다."),
        verification:
          details?.verificationId && details.result
            ? {
                id: details.verificationId,
                result: details.result,
                findings: details.findings ?? [],
              }
            : undefined,
      });
    }
  }, []);

  const overrideQuestion = useCallback(
    async (questionId: string, verificationId: string, reason: string) => {
      dispatch({ type: "complete_started", questionId });
      try {
        const result = await overrideVerification({
          questionId,
          verificationId,
          reason,
        });
        dispatch({
          type: "complete_succeeded",
          questionId,
          capture: result.capture,
          verification: result.verification,
        });
      } catch (error) {
        dispatch({
          type: "complete_failed",
          questionId,
          error: toErrorMessage(error, "예외 승인에 실패했습니다."),
        });
      }
    },
    [],
  );

  const reopenQuestion = useCallback(async (questionId: string) => {
    const question = stateRef.current.questions.find(
      (item) => item.id === questionId,
    );
    if (!question) return;

    try {
      await saveQuestionAnswer({
        questionId,
        answer: question.answer,
        isCompleted: false,
      });
      dispatch({ type: "reopen_question", questionId });
    } catch (error) {
      dispatch({
        type: "save_failed",
        questionId,
        error: toErrorMessage(error, "문항을 다시 열지 못했습니다."),
      });
    }
  }, []);

  const resolveCaptureWith = useCallback(
    async (captureId: string, action: "apply" | "dismiss") => {
      const current = stateRef.current;
      const capture = current.captures.find(
        (item) => item.captureId === captureId,
      );
      if (!current.appId || !capture) return;
      if (action === "apply" && capture.selectedPreviewIds.length === 0) return;

      dispatch({ type: "capture_apply_started", captureId });
      try {
        await resolveCapture({
          appId: current.appId,
          captureId,
          action,
          selectedPreviewIds: capture.selectedPreviewIds,
        });
        dispatch({ type: "capture_resolved", captureId, action });
      } catch (error) {
        dispatch({
          type: "capture_failed",
          captureId,
          error: toErrorMessage(error, "경험 반영에 실패했습니다."),
        });
      }
    },
    [],
  );

  const applyCapture = useCallback(
    (captureId: string) => resolveCaptureWith(captureId, "apply"),
    [resolveCaptureWith],
  );
  const dismissCapture = useCallback(
    (captureId: string) => resolveCaptureWith(captureId, "dismiss"),
    [resolveCaptureWith],
  );

  const finish = useCallback(async () => {
    const current = stateRef.current;
    if (!current.appId) return;
    dispatch({ type: "finish_started" });
    try {
      await completeReadyApplication({
        api: resumeWriteFlowApi,
        appId: current.appId,
      });
    } catch (error) {
      dispatch({
        type: "finish_failed",
        error: toErrorMessage(error, "지원서 완료 처리에 실패했습니다."),
      });
      return;
    }
    const productivity = await fetchProductivity(current.appId);
    dispatch({ type: "finish_succeeded", productivity });
  }, []);

  const resetFlow = useCallback(() => {
    window.sessionStorage.removeItem(resumeWriteFlowStorageKey(null));
    dispatch({ type: "reset" });
  }, []);

  return {
    state,
    dispatch,
    hydrated,
    commands: {
      organize,
      start,
      regenerateDraft: generateFor,
      sendPrompt,
      saveQuestion,
      completeCurrentQuestion,
      reopenQuestion,
      overrideQuestion,
      applyCapture,
      dismissCapture,
      retryCapture,
      finish,
      resetFlow,
    },
  };
}
