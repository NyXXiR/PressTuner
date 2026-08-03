"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PressSimplifiedLayoutState = {
  navCollapsed: boolean;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  toggleNavCollapsed: () => void;
};

export const usePressSimplifiedLayoutStore =
  create<PressSimplifiedLayoutState>()(
    persist(
      (set) => ({
        navCollapsed: false,
        hydrated: false,
        setHydrated: (value) => set({ hydrated: value }),
        toggleNavCollapsed: () =>
          set((state) => ({ navCollapsed: !state.navCollapsed })),
      }),
      {
        name: "press-simplified-nav-collapsed-v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ navCollapsed: state.navCollapsed }),
        onRehydrateStorage: () => (state) => {
          state?.setHydrated(true);
        },
      },
    ),
  );
