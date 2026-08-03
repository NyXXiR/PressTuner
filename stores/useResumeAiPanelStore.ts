"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ResumeAiPanelMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  links?: Array<{ label: string; href: string }>;
  tone?: "neutral" | "error" | "success";
};

type ResumeAiPanelState = {
  guideMessages: ResumeAiPanelMessage[];
  guideLastPathname: string | null;
  writeMessages: ResumeAiPanelMessage[];
  writeSessionKey: string | null;
  setGuideMessages: (messages: ResumeAiPanelMessage[]) => void;
  appendGuideMessage: (message: ResumeAiPanelMessage) => void;
  setGuideLastPathname: (pathname: string) => void;
  clearGuideMessages: () => void;
  setWriteMessages: (messages: ResumeAiPanelMessage[]) => void;
  appendWriteMessage: (message: ResumeAiPanelMessage) => void;
  setWriteSessionKey: (key: string) => void;
  clearWriteMessages: () => void;
};

export const useResumeAiPanelStore = create<ResumeAiPanelState>()(
  persist(
    (set) => ({
      guideMessages: [],
      guideLastPathname: null,
      writeMessages: [],
      writeSessionKey: null,
      setGuideMessages: (messages) => set({ guideMessages: messages }),
      appendGuideMessage: (message) =>
        set((state) => ({ guideMessages: [...state.guideMessages, message] })),
      setGuideLastPathname: (pathname) => set({ guideLastPathname: pathname }),
      clearGuideMessages: () => set({ guideMessages: [], guideLastPathname: null }),
      setWriteMessages: (messages) => set({ writeMessages: messages }),
      appendWriteMessage: (message) =>
        set((state) => ({ writeMessages: [...state.writeMessages, message] })),
      setWriteSessionKey: (key) => set({ writeSessionKey: key }),
      clearWriteMessages: () => set({ writeMessages: [] }),
    }),
    {
      name: "resume:ai-panel",
      partialize: (state) => ({
        guideMessages: state.guideMessages,
        guideLastPathname: state.guideLastPathname,
        writeMessages: state.writeMessages,
        writeSessionKey: state.writeSessionKey,
      }),
    },
  ),
);
