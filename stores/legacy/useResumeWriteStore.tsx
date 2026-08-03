"use client";

import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";
import { useFocusStepStore } from "@/stores/legacy/useFocusStepStore";
import { useMeStore } from "@/stores/useMeStore"; // ✅ Import

// --- Types ---
export type Brick = {
  id: string;
  title: string;
  tags: string[];
  content: string;
  originalText?: string;
  isAiSuggested?: boolean;
  isSelected?: boolean; // UI 필터링의 핵심 키
};

export type QuestionState = {
  id: string;
  questionText: string;
  charLimit: number;
  answer: string;
  aiAdvice?: string;
  relatedBricks: Brick[];
  isSaved: boolean; // 데이터가 서버에 저장되었는지 여부
  isCompleted: boolean; // 문항 작성 완료 여부
};

export type TargetInfo = {
  company: string;
  job: string;
  jd: string;
};

type ResumeWriteState = {
  step: "SETUP" | "STRATEGY" | "FOCUS";
  appId: string | null;
  loading: boolean;
  error: string | null;

  targetInfo: TargetInfo;
  questions: QuestionState[];
  userBricks: Brick[];

  focusIndex: number;
};

type ResumeWriteActions = {
  setTargetInfo: (info: Partial<TargetInfo>) => void;
  setQuestions: (questions: QuestionState[]) => void;
  updateLocalQuestion: (index: number, patch: Partial<QuestionState>) => void;
  setStep: (step: "SETUP" | "STRATEGY" | "FOCUS") => void;
  setFocusIndex: (index: number) => void;

  fetchUserBricks: () => Promise<void>;
  createApplication: () => Promise<boolean>;
  generateStrategy: () => Promise<boolean>;
  saveAnswer: (
    questionId: string,
    answer?: string,
    relatedBricks?: Brick[],
    isComplete?: boolean
  ) => Promise<boolean>;
  updateApplicationStatus: (status: "WRITING" | "DONE") => Promise<boolean>;
  completeApplication: () => Promise<boolean>;

  addEmptyQuestion: () => void;
  addQuestion: (q: { questionText: string; charLimit: number }) => void;
  removeQuestion: (index: number) => void;
  fetchApplication: (id: string) => Promise<boolean>;
  reset: () => void;

  refreshQuota: () => void; // ✅ 쿼터 갱신 액션
};

export const useResumeWriteStore = create<
  ResumeWriteState & ResumeWriteActions
>((set, get) => ({
  // Initial State
  step: "SETUP",
  appId: null,
  loading: false,
  error: null,
  targetInfo: { company: "", job: "", jd: "" },
  questions: [
    {
      id: `temp-${Date.now()}`,
      questionText: "",
      charLimit: 700,
      answer: "",
      relatedBricks: [],
      isSaved: false,
      isCompleted: false,
    },
  ],
  userBricks: [],
  focusIndex: 0,

  // Setters
  setTargetInfo: (patch) =>
    set((state) => ({ targetInfo: { ...state.targetInfo, ...patch } })),
  setQuestions: (questions) => set({ questions }),

  updateLocalQuestion: (index, patch) =>
    set((state) => ({
      questions: state.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q
      ),
    })),

  setStep: (step) => {
    useFocusStepStore.getState().resetFocusState();
    set({ step });
  },

  setFocusIndex: (index) => {
    useFocusStepStore.getState().resetFocusState();
    set({ focusIndex: index });
  },

  addEmptyQuestion: () =>
    set((state) => ({
      questions: [
        ...state.questions,
        {
          id: `temp-${Date.now()}`,
          questionText: "",
          charLimit: 700,
          answer: "",
          relatedBricks: [],
          isSaved: false,
          isCompleted: false,
        },
      ],
    })),

  addQuestion: (q) => {
    set((state) => ({
      questions: [
        ...state.questions,
        {
          id: `temp-${Date.now()}-${Math.random()}`,
          questionText: q.questionText,
          charLimit: q.charLimit,
          answer: "",
          relatedBricks: [],
          isSaved: false,
          isCompleted: false,
        },
      ],
    }));
  },

  removeQuestion: (index) =>
    set((state) => ({
      questions: state.questions.filter((_, i) => i !== index),
    })),

  // ✅ 쿼터 갱신 헬퍼
  refreshQuota: () => {
    useMeStore
      .getState()
      .fetchMe()
      .catch(() => {});
  },

  // API Actions
  fetchUserBricks: async () => {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      const res = await fetchWithLoading(
        `/api/resume/bricks?${params.toString()}`
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        set({ userBricks: data.items });
      }
    } catch (e) {
      console.error("Network error fetching bricks");
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
          jdText: targetInfo.jd,
          questions: questions.map((q) => ({
            questionText: q.questionText,
            charLimit: q.charLimit,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data?.message ?? data?.error ?? "생성 실패");
      set({ appId: data.id, loading: false });
      return true;
    } catch (e: any) {
      set({ loading: false, error: e.message });
      return false;
    }
  },

  generateStrategy: async () => {
    const { appId } = get();
    if (!appId) return false;
    set({ loading: true, error: null });
    try {
      const res = await fetchWithLoading(
        `/api/resume/applications/${appId}/strategy`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data?.message ?? data?.error ?? "생성 실패");

      const mappedQuestions: QuestionState[] = data.items.map((dbQ: any) => ({
        id: dbQ.id,
        questionText: dbQ.questionText,
        charLimit: dbQ.charLimit || 700,
        answer: dbQ.answer || "",
        aiAdvice: dbQ.aiAdvice || "AI 조언이 생성되었습니다.",
        relatedBricks: dbQ.relatedBricks.map((rb: any) => ({
          ...rb.brick,
          isAiSuggested: true,
          isSelected: true,
        })),
        isSaved: true,
        isCompleted: dbQ.isCompleted || false,
      }));

      useFocusStepStore.getState().resetFocusState();
      set({ questions: mappedQuestions, step: "STRATEGY", loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: "전략 생성 실패" });
      return false;
    }
  },

  saveAnswer: async (questionId, answer, relatedBricks, isComplete = true) => {
    try {
      const payload: any = {};
      if (answer !== undefined) payload.answer = answer;
      if (relatedBricks) payload.relatedBricks = relatedBricks;

      payload.isCompleted = isComplete;

      const res = await fetchWithLoading(
        `/api/resume/questions/${questionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const { questions } = get();
        const idx = questions.findIndex((q) => q.id === questionId);
        if (idx >= 0) {
          const newQ = {
            ...questions[idx],
            isSaved: true,
            isCompleted: isComplete,
          };

          if (answer !== undefined) newQ.answer = answer;
          if (relatedBricks) newQ.relatedBricks = relatedBricks;

          const newQuestions = [...questions];
          newQuestions[idx] = newQ;
          set({ questions: newQuestions });
        }

        // ✅ 저장 성공 시 쿼터 갱신 (선택적)
        // (FocusStep 등에서 직접 갱신하므로 여기서는 방어적으로 호출)
        get().refreshQuota();

        return true;
      }
      return false;
    } catch (e) {
      console.error("Save failed", e);
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
    } catch (e) {
      return false;
    }
  },

  completeApplication: async () => {
    const { updateApplicationStatus } = get();
    set({ loading: true, error: null });
    const success = await updateApplicationStatus("DONE");
    set({ loading: false });
    if (!success) set({ error: "완료 처리 중 오류가 발생했습니다." });
    return success;
  },

  fetchApplication: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetchWithLoading(`/api/resume/applications/${id}`);
      const json = await res.json();
      if (!res.ok || !json.ok)
        throw new Error(json?.message ?? json?.error ?? "저장 실패");
      const app = json.data;

      const mappedQuestions: QuestionState[] = app.questions.map(
        (dbQ: any) => ({
          id: dbQ.id,
          questionText: dbQ.questionText,
          charLimit: dbQ.charLimit || 700,
          answer: dbQ.answer || "",
          aiAdvice: dbQ.aiAdvice || "AI 전략이 수립되었습니다.",
          relatedBricks: dbQ.relatedBricks.map((link: any) => ({
            ...link.brick,
            isAiSuggested: link.isAiSuggested,
            isSelected: link.isSelected,
          })),
          isSaved: true,
          isCompleted: dbQ.isCompleted || false,
        })
      );

      useFocusStepStore.getState().resetFocusState();
      set({
        appId: app.id,
        targetInfo: {
          company: app.companyName,
          job: app.jobTitle,
          jd: app.jdText || "",
        },
        questions: mappedQuestions,
        step: mappedQuestions.length > 0 ? "STRATEGY" : "SETUP",
        loading: false,
      });
      return true;
    } catch (e) {
      set({ loading: false, error: "불러오기 실패" });
      return false;
    }
  },

  reset: () => {
    useFocusStepStore.getState().resetFocusState();
    set({
      step: "SETUP",
      appId: null,
      targetInfo: { company: "", job: "", jd: "" },
      questions: [
        {
          id: `temp-${Date.now()}`,
          questionText: "",
          charLimit: 700,
          answer: "",
          relatedBricks: [],
          isSaved: false,
          isCompleted: false,
        },
      ],
      focusIndex: 0,
      error: null,
      loading: false,
    });
  },
}));
