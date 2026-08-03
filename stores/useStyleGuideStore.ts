import { create } from "zustand";
import { StyleRuleSet } from "@/lib/styleCompiler";

// API 응답 타입 정의
export type StyleGuideMeta = {
  version: number;
  updatedAt: string | null;
};

interface StyleGuideState {
  rules: StyleRuleSet;
  meta: StyleGuideMeta | null;

  // ✅ [수정] 4. isSaving 상태 명시
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;

  // Actions
  setInitialData: (rules: StyleRuleSet, meta: StyleGuideMeta) => void;

  // ✅ [수정] 4. isSaving 변경 액션 추가
  setSaving: (isSaving: boolean) => void;

  // 규칙 조작 Actions
  addBanWord: (word: string) => void;
  removeBanWord: (word: string) => void;

  addToneRule: (recommendation: string) => void;
  removeToneRule: (index: number) => void;

  addVocabRule: (from: string, to: string) => void;
  removeVocabRule: (index: number) => void;

  addBoilerplate: (slot: "lead" | "body" | "closing", text: string) => void;
  removeBoilerplate: (targetItem: any) => void;
}

const emptyRules: StyleRuleSet = {
  toneHints: [],
  banList: [],
  vocabulary: [],
  boilerplates: [],
  keywords: [],
};

export const useStyleGuideStore = create<StyleGuideState>((set) => ({
  rules: emptyRules,
  meta: null,
  isLoading: false,
  isSaving: false, // 초기값
  isDirty: false,

  setInitialData: (rules, meta) =>
    set({
      rules: rules || emptyRules,
      meta,
      isDirty: false,
    }),

  // ✅ [수정] 4. 구현
  setSaving: (isSaving) => set({ isSaving }),

  // --- 이하 규칙 조작 로직은 기존과 동일 ---
  addBanWord: (word) =>
    set((state) => ({
      rules: {
        ...state.rules,
        banList: [...(state.rules.banList || []), word],
      },
      isDirty: true,
    })),

  removeBanWord: (word) =>
    set((state) => ({
      rules: {
        ...state.rules,
        banList: (state.rules.banList || []).filter((w) => w !== word),
      },
      isDirty: true,
    })),

  addToneRule: (recommendation) =>
    set((state) => ({
      rules: {
        ...state.rules,
        toneHints: [
          { pattern: ".*", recommendation, isManual: true },
          ...(state.rules.toneHints || []),
        ],
      },
      isDirty: true,
    })),

  removeToneRule: (index) =>
    set((state) => ({
      rules: {
        ...state.rules,
        toneHints: (state.rules.toneHints || []).filter((_, i) => i !== index),
      },
      isDirty: true,
    })),

  addVocabRule: (from, to) =>
    set((state) => ({
      rules: {
        ...state.rules,
        vocabulary: [
          ...(state.rules.vocabulary || []),
          { from, to, isManual: true },
        ],
      },
      isDirty: true,
    })),

  removeVocabRule: (index) =>
    set((state) => ({
      rules: {
        ...state.rules,
        vocabulary: (state.rules.vocabulary || []).filter(
          (_, i) => i !== index
        ),
      },
      isDirty: true,
    })),

  addBoilerplate: (slot, text) =>
    set((state) => ({
      rules: {
        ...state.rules,
        boilerplates: [
          ...(state.rules.boilerplates || []),
          { slot, text, isManual: true },
        ],
      },
      isDirty: true,
    })),

  removeBoilerplate: (targetItem) =>
    set((state) => ({
      rules: {
        ...state.rules,
        boilerplates: (state.rules.boilerplates || []).filter(
          (b) => b !== targetItem
        ),
      },
      isDirty: true,
    })),
}));
