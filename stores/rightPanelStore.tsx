"use client";

import { create } from "zustand";

interface RightPanelState {
  isOpen: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useRightPanelStore = create<RightPanelState>()((set) => ({
  isOpen: false,
  hasHydrated: true,
  setHasHydrated: (v) => set({ hasHydrated: v }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
