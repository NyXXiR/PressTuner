"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  isOpen: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isOpen: false, //처음 사이트에 오면 닫힌 상태여야 함(펴져 있으면 소개글 보기 거슬림)
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    }),
    {
      name: "ui:sidebar",
      partialize: (s) => ({ isOpen: s.isOpen }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
