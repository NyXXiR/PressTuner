// stores/useUiStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type GlobalOverlayState = {
  open: boolean;
  title?: string; // 필요 없으면 제거 가능
  message?: string;
};

type UiState = {
  // --------------------
  // 기존
  // --------------------
  pendingCount: number;
  startLoading: () => void;
  endLoading: () => void;

  // --------------------
  // 추가(기존)
  // --------------------
  mobileHeaderCollapsed: boolean;
  setMobileHeaderCollapsed: (v: boolean) => void;
  toggleMobileHeaderCollapsed: () => void;

  // --------------------
  // ✅ 추가: 전역 오버레이 (화면 잠금 필요할 때만)
  // --------------------
  globalOverlay: GlobalOverlayState;
  showGlobalOverlay: (opt?: { title?: string; message?: string }) => void;
  hideGlobalOverlay: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      // --------------------
      // 기존
      // --------------------
      pendingCount: 0,
      startLoading: () => set((s) => ({ pendingCount: s.pendingCount + 1 })),
      endLoading: () =>
        set((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) })),

      // --------------------
      // 추가(기존)
      // --------------------
      mobileHeaderCollapsed: false,
      setMobileHeaderCollapsed: (v) => set({ mobileHeaderCollapsed: v }),
      toggleMobileHeaderCollapsed: () =>
        set({ mobileHeaderCollapsed: !get().mobileHeaderCollapsed }),

      // --------------------
      // ✅ 전역 오버레이
      // --------------------
      globalOverlay: { open: false, title: undefined, message: undefined },

      showGlobalOverlay: (opt) =>
        set({
          globalOverlay: {
            open: true,
            title: opt?.title,
            message: opt?.message,
          },
        }),

      hideGlobalOverlay: () =>
        set({
          globalOverlay: { open: false, title: undefined, message: undefined },
        }),
    }),
    {
      name: "press-tuner-ui",
      // ✅ persist는 UI 취향만. 로딩/오버레이는 세션 유지할 필요 없으니 제외.
      partialize: (s) => ({
        mobileHeaderCollapsed: s.mobileHeaderCollapsed,
      }),
    }
  )
);
