// src/stores/billingHistoryFilterStore.ts
"use client";

import { create } from "zustand";

export type BillingRangePreset = "7d" | "1m" | "3m" | "6m" | "custom";

export type BillingHistoryFilterState = {
  preset: BillingRangePreset;

  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;

  setPreset: (preset: BillingRangePreset) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;

  /** 프리셋 적용 시 start/end 자동 계산 */
  applyPreset: (preset: Exclude<BillingRangePreset, "custom">) => void;

  /** 커스텀 적용 */
  applyCustom: (startDate: string, endDate: string) => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 로컬 타임존 기반 YYYY-MM-DD (KST 환경이면 그대로 KST) */
function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * 프리셋 범위 계산:
 * - endDate: 오늘(포함)
 * - startDate: 오늘-6일, 1달 전 동일일, 3달, 6달
 */
function computeRange(preset: Exclude<BillingRangePreset, "custom">) {
  const today = new Date();
  const endDate = toYmd(today);

  let start: Date;
  if (preset === "7d") start = addDays(today, -6);
  else if (preset === "1m") start = addMonths(today, -1);
  else if (preset === "3m") start = addMonths(today, -3);
  else start = addMonths(today, -6);

  return { startDate: toYmd(start), endDate };
}

const defaultPreset: Exclude<BillingRangePreset, "custom"> = "3m";
const initialRange = computeRange(defaultPreset);

export const useBillingHistoryFilterStore = create<BillingHistoryFilterState>(
  (set) => ({
    preset: defaultPreset,
    startDate: initialRange.startDate,
    endDate: initialRange.endDate,

    setPreset: (preset) => set({ preset }),
    setStartDate: (v) => set({ startDate: v }),
    setEndDate: (v) => set({ endDate: v }),

    applyPreset: (preset) => {
      const r = computeRange(preset);
      set({ preset, startDate: r.startDate, endDate: r.endDate });
    },

    applyCustom: (startDate, endDate) => {
      set({ preset: "custom", startDate, endDate });
    },
  })
);
