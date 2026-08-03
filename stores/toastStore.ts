"use client";

import { create } from "zustand";

export type ToastVariant = "default" | "success" | "error" | "info";
// ✅ 위치 타입 추가
export type ToastPosition = "bottom-right" | "top-center";

export type AppToast = {
  id: string;
  variant: ToastVariant;
  position: ToastPosition; // ✅ 추가
  title?: string;
  description?: string;
  createdAt: number;
  durationMs: number;
};

type ToastStore = {
  items: AppToast[];
  push: (
    t: Omit<AppToast, "id" | "createdAt" | "position"> & {
      id?: string;
      position?: ToastPosition;
    }
  ) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useToastStore = create<ToastStore>()((set, get) => ({
  items: [],

  push: (t) => {
    const id = t.id ?? crypto.randomUUID();
    const toast: AppToast = {
      id,
      variant: t.variant ?? "default",
      position: t.position ?? "top-center", // ✅ 기본값 설정
      title: t.title,
      description: t.description,
      createdAt: Date.now(),
      durationMs: t.durationMs ?? 3000,
    };

    set((s) => ({ items: [...s.items, toast] }));

    window.setTimeout(() => {
      get().remove(id);
    }, toast.durationMs);
  },

  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set(() => ({ items: [] })),
}));

// ✅ 편리한 사용을 위한 헬퍼 객체 확장
export const toast = {
  info: (
    description: string,
    title?: string,
    position: ToastPosition = "top-center"
  ) =>
    useToastStore.getState().push({
      variant: "info",
      title,
      description,
      durationMs: 4000,
      position,
    }),

  success: (
    description: string,
    title?: string,
    position: ToastPosition = "top-center"
  ) =>
    useToastStore.getState().push({
      variant: "success",
      title,
      description,
      durationMs: 4000,
      position,
    }),

  error: (
    description: string,
    title?: string,
    position: ToastPosition = "top-center"
  ) =>
    useToastStore.getState().push({
      variant: "error",
      title,
      description,
      durationMs: 5000,
      position,
    }),
};
