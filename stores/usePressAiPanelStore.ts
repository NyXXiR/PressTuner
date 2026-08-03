"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PressAiPanelMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  links?: Array<{ label: string; href: string }>;
  tone?: "neutral" | "error" | "success";
};

type PressAiPanelState = {
  guideMessages: PressAiPanelMessage[];
  guideLastPathname: string | null;
  editMessages: PressAiPanelMessage[];
  editSessionKey: string | null;
  setGuideMessages: (messages: PressAiPanelMessage[]) => void;
  appendGuideMessage: (message: PressAiPanelMessage) => void;
  setGuideLastPathname: (pathname: string) => void;
  clearGuideMessages: () => void;
  setEditMessages: (messages: PressAiPanelMessage[]) => void;
  appendEditMessage: (message: PressAiPanelMessage) => void;
  setEditSessionKey: (key: string) => void;
  clearEditMessages: () => void;
};

export const usePressAiPanelStore = create<PressAiPanelState>()(
  persist(
    (set) => ({
      guideMessages: [],
      guideLastPathname: null,
      editMessages: [],
      editSessionKey: null,
      setGuideMessages: (messages) => set({ guideMessages: messages }),
      appendGuideMessage: (message) =>
        set((state) => ({ guideMessages: [...state.guideMessages, message] })),
      setGuideLastPathname: (pathname) => set({ guideLastPathname: pathname }),
      clearGuideMessages: () => set({ guideMessages: [], guideLastPathname: null }),
      setEditMessages: (messages) => set({ editMessages: messages }),
      appendEditMessage: (message) =>
        set((state) => ({ editMessages: [...state.editMessages, message] })),
      setEditSessionKey: (key) => set({ editSessionKey: key }),
      clearEditMessages: () => set({ editMessages: [] }),
    }),
    {
      name: "press:ai-panel",
      partialize: (state) => ({
        guideMessages: state.guideMessages,
        guideLastPathname: state.guideLastPathname,
        editMessages: state.editMessages,
        editSessionKey: state.editSessionKey,
      }),
    },
  ),
);
