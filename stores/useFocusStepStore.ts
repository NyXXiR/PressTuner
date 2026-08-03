import { create } from "zustand";

export type PolishType = "critical" | "suggestion";

export type PolishSpan = {
  id: string;
  start: number;
  end: number;
  note: string;
  quote?: string;
  type?: PolishType;
};

export type LeftTab = "WRITE" | "POLISH";

export type QueuedAiCommand = {
  action:
    | "open_question"
    | "refresh_strategy"
    | "draft_missing_answers"
    | "draft_current_answer"
    | "analyze_current_answer"
    | "revise_current_answer"
    | "manage_current_bricks";
  command: string;
  instruction?: string | null;
  targetQuestionOrder?: number | null;
};

interface FocusStepState {
  // UI 탭 상태
  activeTab: LeftTab;

  // WRITE 탭 상태 (AI 초안 생성 관련)
  instruction: string;
  isGenerating: boolean;

  // POLISH 탭 상태 (AI 첨삭 관련)
  spans: PolishSpan[];
  selectedSpanIds: Set<string>;
  isPolishing: boolean;
  lastPolishedText: string;
  repolishInstruction: string;
  isRepolishing: boolean;

  // 수정 제안 비교 모달 상태
  pendingResult: { original: string; revised: string } | null;
  queuedCommands: QueuedAiCommand[];

  // Actions
  setActiveTab: (tab: LeftTab) => void;
  setInstruction: (instruction: string) => void;
  setIsGenerating: (isGenerating: boolean) => void;

  setSpans: (spans: PolishSpan[]) => void;
  setIsPolishing: (isPolishing: boolean) => void;
  setLastPolishedText: (text: string) => void;

  toggleSpanSelection: (id: string) => void;
  clearSpanSelection: () => void;

  setRepolishInstruction: (instruction: string) => void;
  setIsRepolishing: (isRepolishing: boolean) => void;
  setPendingResult: (
    result: { original: string; revised: string } | null
  ) => void;
  setQueuedCommand: (command: QueuedAiCommand | null) => void;
  setQueuedCommands: (commands: QueuedAiCommand[]) => void;
  enqueueQueuedCommands: (commands: QueuedAiCommand[]) => void;
  clearNextQueuedCommand: () => void;
  clearQueuedCommand: () => void;

  // 질문 전환 시 상태 초기화
  resetFocusState: () => void;
}

export const useFocusStepStore = create<FocusStepState>((set) => ({
  activeTab: "WRITE",
  instruction: "",
  isGenerating: false,
  spans: [],
  selectedSpanIds: new Set(),
  isPolishing: false,
  lastPolishedText: "",
  repolishInstruction: "",
  isRepolishing: false,
  pendingResult: null,
  queuedCommands: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setInstruction: (instruction) => set({ instruction }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),

  setSpans: (spans) => set({ spans }),
  setIsPolishing: (isPolishing) => set({ isPolishing }),
  setLastPolishedText: (text) => set({ lastPolishedText: text }),

  toggleSpanSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedSpanIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedSpanIds: next };
    }),

  clearSpanSelection: () => set({ selectedSpanIds: new Set() }),

  setRepolishInstruction: (instruction) =>
    set({ repolishInstruction: instruction }),
  setIsRepolishing: (isRepolishing) => set({ isRepolishing }),
  setPendingResult: (result) => set({ pendingResult: result }),
  setQueuedCommand: (command) =>
    set({ queuedCommands: command ? [command] : [] }),
  setQueuedCommands: (commands) => set({ queuedCommands: commands }),
  enqueueQueuedCommands: (commands) =>
    set((state) => ({ queuedCommands: [...state.queuedCommands, ...commands] })),
  clearNextQueuedCommand: () =>
    set((state) => ({ queuedCommands: state.queuedCommands.slice(1) })),
  clearQueuedCommand: () => set({ queuedCommands: [] }),

  resetFocusState: () =>
    set({
      activeTab: "WRITE", // 탭을 '작성 도우미'로 리셋하여 가이드라인 노출
      instruction: "", // 사용자 입력 프롬프트 초기화
      spans: [], // 첨삭 데이터 초기화
      selectedSpanIds: new Set(),
      lastPolishedText: "",
      repolishInstruction: "",
      pendingResult: null,
      // isGenerating, isPolishing 등 로딩 상태는 굳이 초기화 안 해도 작업 끝나면 false임
    }),
}));
