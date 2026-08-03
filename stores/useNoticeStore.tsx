// lib/store/useNoticeStore.ts
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const KST_OFFSET = 9 * 60 * 60 * 1000;

const getTodayKey = (noticeId: string) => {
  // KST 기준 오늘 날짜 키
  const today = new Date(Date.now() + KST_OFFSET).toISOString().slice(0, 10);
  return `${noticeId}_${today}`;
};

interface NoticeState {
  hiddenNotices: Record<string, string>;
  hideToday: (noticeId: string) => void;
  isHiddenToday: (noticeId: string) => boolean;
}

export const useNoticeStore = create<NoticeState>()(
  persist(
    (set, get) => ({
      hiddenNotices: {},
      hideToday: (noticeId) => {
        const key = getTodayKey(noticeId);
        set((state) => ({
          hiddenNotices: { ...state.hiddenNotices, [key]: "1" },
        }));
      },
      isHiddenToday: (noticeId) => {
        const key = getTodayKey(noticeId);
        return !!get().hiddenNotices[key];
      },
    }),
    {
      name: "brieFFlow-notice-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
