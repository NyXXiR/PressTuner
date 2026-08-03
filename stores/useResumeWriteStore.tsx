"use client";

import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";
import { useMeStore } from "@/stores/useMeStore";
import { toISODateOnly } from "@/lib/utils/datetime";
import {
  buildResumeBriefContext,
  createEmptyResumeBrief,
  parseResumeBrief,
  serializeResumeBrief,
  type ResumeStructuredBrief,
} from "@/lib/services/resume/resumeBrief";

export type ResumeWriteStep = "COLLECT" | "PLAN" | "DRAFT" | "COMPLETE";

export type Brick = {
  id: string;
  title: string;
  tags: string[];
  content: string;
  originalText?: string;
  isAiSuggested?: boolean;
  isSelected?: boolean;
};

export type QuestionState = {
  id: string;
  questionText: string;
  charLimit: number;
  answer: string;
  aiAdvice?: string;
  relatedBricks: Brick[];
  isSaved: boolean;
  isCompleted: boolean;
  draftStatus?: "idle" | "generating" | "ready" | "error";
  draftError?: string | null;
};

export type TargetInfo = {
  company: string;
  job: string;
  brief: ResumeStructuredBrief;
};

type TargetInfoPatch = Partial<Omit<TargetInfo, "brief">> & {
  brief?: Partial<ResumeStructuredBrief>;
};

type ResumeWriteState = {
  step: ResumeWriteStep;
  appId: string | null;
  loading: boolean;
  error: string | null;
  targetInfo: TargetInfo;
  questions: QuestionState[];
  userBricks: Brick[];
  focusIndex: number;
};

type ResumeWriteActions = {
  setTargetInfo: (info: TargetInfoPatch) => void;
  setQuestions: (questions: QuestionState[]) => void;
  updateLocalQuestion: (index: number, patch: Partial<QuestionState>) => void;
  updateQuestionById: (questionId: string, patch: Partial<QuestionState>) => void;
  invalidateDrafts: () => void;
  setStep: (step: ResumeWriteStep) => void;
  setFocusIndex: (index: number) => void;
  fetchUserBricks: () => Promise<void>;
  createApplication: () => Promise<boolean>;
  saveDraftApplication: () => Promise<boolean>;
  generateStrategy: () => Promise<boolean>;
  saveAnswer: (
    questionId: string,
    answer?: string,
    relatedBricks?: Brick[],
    isComplete?: boolean,
  ) => Promise<boolean>;
  updateApplicationStatus: (status: "WRITING" | "DONE") => Promise<boolean>;
  completeApplication: () => Promise<boolean>;
  addEmptyQuestion: () => void;
  addQuestion: (q?: { questionText?: string; charLimit?: number }) => void;
  removeQuestion: (index: number) => void;
  fetchApplication: (id: string) => Promise<boolean>;
  reset: () => void;
  refreshQuota: () => void;
};

function createEmptyQuestion(): QuestionState {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    questionText: "",
    charLimit: 700,
    answer: "",
    relatedBricks: [],
    isSaved: false,
    isCompleted: false,
    draftStatus: "idle",
    draftError: null,
  };
}

function mapDbQuestion(dbQ: any): QuestionState {
  return {
    id: dbQ.id,
    questionText: dbQ.questionText,
    charLimit: dbQ.charLimit || 700,
    answer: dbQ.answer || "",
    aiAdvice: dbQ.aiAdvice || "",
    relatedBricks: (dbQ.relatedBricks || []).map((link: any) => {
      const brick = link.brick ?? link;
      return {
        ...brick,
        isAiSuggested: link.isAiSuggested ?? true,
        isSelected: link.isSelected ?? true,
      };
    }),
    isSaved: true,
    isCompleted: dbQ.isCompleted || false,
    draftStatus: dbQ.answer?.trim() ? "ready" : "idle",
    draftError: null,
  };
}

export const useResumeWriteStore = create<
  ResumeWriteState & ResumeWriteActions
>((set, get) => ({
  step: "COLLECT",
  appId: null,
  loading: false,
  error: null,
  targetInfo: { company: "", job: "", brief: createEmptyResumeBrief() },
  questions: [createEmptyQuestion()],
  userBricks: [],
  focusIndex: 0,

  setTargetInfo: (patch) =>
    set((state) => ({
      targetInfo: {
        ...state.targetInfo,
        ...patch,
        brief: {
          ...state.targetInfo.brief,
          ...(patch.brief ?? {}),
        },
      },
    })),

  setQuestions: (questions) =>
    set({
      questions,
      focusIndex: 0,
    }),

  updateLocalQuestion: (index, patch) =>
    set((state) => ({
      questions: state.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ),
    })),

  updateQuestionById: (questionId, patch) =>
    set((state) => ({
      questions: state.questions.map((question) =>
        question.id === questionId ? { ...question, ...patch } : question,
      ),
    })),

  invalidateDrafts: () =>
    set((state) => ({
      questions: state.questions.map((question) => ({
        ...question,
        answer: "",
        aiAdvice: "",
        isCompleted: false,
        draftStatus: "idle",
        draftError: null,
      })),
      focusIndex: 0,
    })),

  setStep: (step) => set({ step }),

  setFocusIndex: (index) =>
    set((state) => ({
      focusIndex: Math.max(0, Math.min(index, state.questions.length - 1)),
    })),

  addEmptyQuestion: () =>
    set((state) => ({ questions: [...state.questions, createEmptyQuestion()] })),

  addQuestion: (q) =>
    set((state) => ({
      questions: [
        ...state.questions,
        {
          ...createEmptyQuestion(),
          questionText: q?.questionText ?? "",
          charLimit: q?.charLimit ?? 700,
        },
      ],
    })),

  removeQuestion: (index) =>
    set((state) => {
      const nextQuestions = state.questions.filter((_, i) => i !== index);
      return {
        questions: nextQuestions,
        focusIndex: Math.max(0, Math.min(state.focusIndex, nextQuestions.length - 1)),
      };
    }),

  refreshQuota: () => {
    useMeStore
      .getState()
      .fetchMe()
      .catch(() => {});
  },

  fetchUserBricks: async () => {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      const res = await fetchWithLoading(`/api/resume/bricks?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        set({ userBricks: data.items });
      }
    } catch (error) {
      console.error("Failed to fetch resume bricks", error);
    }
  },

  createApplication: async () => {
    const { targetInfo, questions } = get();
    set({ loading: true, error: null });

    try {
      const res = await fetchWithLoading("/api/resume/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: targetInfo.company,
          jobTitle: targetInfo.job,
          jdText: serializeResumeBrief(targetInfo.brief),
          deadline: targetInfo.brief.deadline,
          questions: questions
            .filter((q) => q.questionText.trim().length > 0)
            .map((q) => ({
              questionText: q.questionText.trim(),
              charLimit: q.charLimit,
            })),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message ?? data?.error ?? "지원서 생성에 실패했습니다.");
      }

      set({ appId: data.id, loading: false });
      return true;
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message ?? "지원서 생성에 실패했습니다.",
      });
      return false;
    }
  },

  saveDraftApplication: async () => {
    const { appId, targetInfo, questions } = get();
    const payload = {
      companyName: targetInfo.company,
      jobTitle: targetInfo.job,
      jdText: serializeResumeBrief(targetInfo.brief),
      deadline: targetInfo.brief.deadline,
      questions: questions
        .filter((question) => question.questionText.trim().length > 0)
        .map((question) => ({
          id: question.id.startsWith("temp-") || question.id.startsWith("manual-") || question.id.startsWith("intake-")
            ? undefined
            : question.id,
          questionText: question.questionText.trim(),
          charLimit: question.charLimit,
        })),
    };

    set({ loading: true, error: null });

    try {
      if (!appId) {
        const created = await get().createApplication();
        return created;
      }

      const res = await fetchWithLoading(`/api/resume/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message ?? data?.error ?? "지원서 저장에 실패했습니다.");
      }

      set({ loading: false });
      return true;
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message ?? "지원서 저장에 실패했습니다.",
      });
      return false;
    }
  },

  generateStrategy: async () => {
    const { appId } = get();
    if (!appId) return false;

    set({ loading: true, error: null });

    try {
      const res = await fetchWithLoading(`/api/resume/applications/${appId}/strategy`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message ?? data?.error ?? "전략 생성에 실패했습니다.");
      }

      set({
        questions: data.items.map(mapDbQuestion),
        step: "DRAFT",
        loading: false,
        focusIndex: 0,
      });

      return true;
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message ?? "전략 생성에 실패했습니다.",
      });
      return false;
    }
  },

  saveAnswer: async (questionId, answer, relatedBricks, isComplete = true) => {
    try {
      const payload: Record<string, unknown> = { isCompleted: isComplete };
      if (answer !== undefined) payload.answer = answer;
      if (relatedBricks) payload.relatedBricks = relatedBricks;

      const res = await fetchWithLoading(`/api/resume/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return false;

      const { questions } = get();
      const nextQuestions = questions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              answer: answer ?? question.answer,
              relatedBricks: relatedBricks ?? question.relatedBricks,
              isSaved: true,
              isCompleted: isComplete,
              draftStatus: (answer ?? question.answer).trim() ? "ready" : question.draftStatus ?? "idle",
              draftError: null,
            }
          : question,
      );

      set({ questions: nextQuestions });
      get().refreshQuota();
      return true;
    } catch (error) {
      console.error("Failed to save answer", error);
      return false;
    }
  },

  updateApplicationStatus: async (status) => {
    const { appId } = get();
    if (!appId) return false;

    try {
      const res = await fetchWithLoading(`/api/resume/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      return res.ok && data.ok;
    } catch (error) {
      console.error("Failed to update application status", error);
      return false;
    }
  },

  completeApplication: async () => {
    set({ loading: true, error: null });
    const success = await get().updateApplicationStatus("DONE");
    set({
      step: success ? "COMPLETE" : get().step,
      loading: false,
      error: success ? null : "완료 처리 중 오류가 발생했습니다.",
    });
    return success;
  },

  fetchApplication: async (id) => {
    set({ loading: true, error: null });

    try {
      const res = await fetchWithLoading(`/api/resume/applications/${id}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.message ?? data?.error ?? "지원서를 불러오지 못했습니다.");
      }

      const app = data.data;
      const parsedBrief = parseResumeBrief(app.jdText);
      const isCompletedApplication =
        app.status === "DONE" ||
        ((app.questions || []).length > 0 &&
          (app.questions || []).every((question: any) => question.isCompleted));
      const hasDraftProgress = (app.questions || []).some(
        (question: any) =>
          Boolean(question.answer?.trim()) ||
          Boolean(question.aiAdvice?.trim()) ||
          (question.relatedBricks || []).length > 0 ||
          question.isCompleted,
      );

      set({
        appId: app.id,
        targetInfo: {
          company: app.companyName,
          job: app.jobTitle,
          brief: {
            ...parsedBrief,
            deadline: parsedBrief.deadline || toISODateOnly(app.deadline),
          },
        },
        questions: (app.questions || []).map(mapDbQuestion),
        step: isCompletedApplication ? "COMPLETE" : hasDraftProgress ? "DRAFT" : "PLAN",
        loading: false,
        focusIndex: 0,
      });
      return true;
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message ?? "지원서를 불러오지 못했습니다.",
      });
      return false;
    }
  },

  reset: () =>
    set({
      step: "COLLECT",
      appId: null,
      loading: false,
      error: null,
      targetInfo: { company: "", job: "", brief: createEmptyResumeBrief() },
      questions: [createEmptyQuestion()],
      userBricks: [],
      focusIndex: 0,
    }),
}));

export { buildResumeBriefContext };
