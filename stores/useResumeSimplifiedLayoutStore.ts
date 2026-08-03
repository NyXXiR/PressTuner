"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ResumeSimplifiedLayoutState = {
  navCollapsed: boolean;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  toggleNavCollapsed: () => void;
};

export const useResumeSimplifiedLayoutStore =
  create<ResumeSimplifiedLayoutState>()(
    persist(
      (set) => ({
        navCollapsed: false,
        hydrated: false,
        setHydrated: (value) => set({ hydrated: value }),
        toggleNavCollapsed: () =>
          set((state) => ({ navCollapsed: !state.navCollapsed })),
      }),
      {
        name: "resume-simplified-nav-collapsed-v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ navCollapsed: state.navCollapsed }),
        onRehydrateStorage: () => (state) => {
          state?.setHydrated(true);
        },
      },
    ),
  );
