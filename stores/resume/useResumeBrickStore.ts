"use client";

import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";

export type BrickItem = {
  id: string;
  title: string;
  content: string;
  period: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  tags: string[];
  source: "MANUAL" | "FILE_PARSE" | "AI_EXTRACT";
  memoryStatus: "CONFIRMED" | "NEEDS_REVIEW";
  createdAt: string;
};

type QueryState = {
  q: string;
  page: number;
  pageSize: number;
};

type ListState = {
  items: BrickItem[];
  total: number;
  confirmedTotal: number;
  loading: boolean;
  error?: string | null;
};

type Store = {
  query: QueryState;
  list: ListState;
  hasBricks: boolean | null;

  setSearch: (q: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;

  fetchList: (options?: { append?: boolean }) => Promise<void>;
  checkHasBricks: () => Promise<void>;
  getAllBricks: () => Promise<BrickItem[]>;
  createBrick: (payload: any) => Promise<boolean>;
  updateBrick: (id: string, payload: any) => Promise<boolean>;
  deleteOne: (id: string) => Promise<void>;

  deleteAll: () => Promise<boolean>;
  createBricksBatch: (payloads: any[]) => Promise<boolean>;
  parsePdf: (file: File) => Promise<any[] | null>;
};

export const useResumeBrickStore = create<Store>()((set, get) => ({
  query: {
    q: "",
    page: 1,
    pageSize: 10,
  },

  list: { items: [], total: 0, confirmedTotal: 0, loading: false, error: null },
  hasBricks: null,

  setSearch: (q) => set((s) => ({ query: { ...s.query, q, page: 1 } })),
  setPage: (page) => set((s) => ({ query: { ...s.query, page } })),
  setPageSize: (pageSize) =>
    set((s) => ({ query: { ...s.query, pageSize, page: 1 } })),

  checkHasBricks: async () => {
    try {
      const res = await fetchWithLoading(
        `/api/resume/bricks?page=1&pageSize=1`
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        set({ hasBricks: data.total > 0 });
      } else {
        set({ hasBricks: false });
      }
    } catch {
      set({ hasBricks: false });
    }
  },

  getAllBricks: async () => {
    try {
      const res = await fetchWithLoading("/api/resume/bricks/all");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.items)) {
        return data.items as BrickItem[];
      }
      return [];
    } catch (e) {
      console.error("Failed to fetch all bricks:", e);
      return [];
    }
  },

  fetchList: async (options) => {
    const { q, page, pageSize } = get().query;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", page.toString());
    params.set("pageSize", pageSize.toString());

    set((s) => ({ list: { ...s.list, loading: true, error: null } }));

    try {
      const res = await fetchWithLoading(
        `/api/resume/bricks?${params.toString()}`
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        set((s) => ({
          list: {
            ...s.list,
            loading: false,
            error: data?.message ?? data?.error ?? "데이터 로드 실패",
          },
        }));
        return;
      }

      const nextItems = data.items ?? [];

      set((s) => ({
        list: {
          items: options?.append ? [...s.list.items, ...nextItems] : nextItems,
          total: data.total ?? 0,
          confirmedTotal: data.confirmedTotal ?? data.total ?? 0,
          loading: false,
          error: null,
        },
        hasBricks: data.total > 0,
      }));
    } catch {
      set((s) => ({
        list: { ...s.list, loading: false, error: "네트워크 오류" },
      }));
    }
  },

  createBrick: async (payload) => {
    try {
      const res = await fetchWithLoading(`/api/resume/bricks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.pendingReview) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  updateBrick: async (id, payload) => {
    try {
      const res = await fetchWithLoading(`/api/resume/bricks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.pendingReview) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  deleteOne: async (id: string) => {
    const prevItems = get().list.items;
    set((s) => ({
      list: { ...s.list, items: s.list.items.filter((item) => item.id !== id) },
    }));

    try {
      const res = await fetchWithLoading(`/api/resume/bricks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      await get().fetchList();
    } catch {
      set((s) => ({ list: { ...s.list, items: prevItems } }));
      alert("삭제 실패");
    }
  },

  deleteAll: async () => {
    try {
      const res = await fetchWithLoading("/api/resume/bricks/all", {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        set(() => ({
          list: { items: [], total: 0, confirmedTotal: 0, loading: false, error: null },
          hasBricks: false,
        }));
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  parsePdf: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetchWithLoading("/api/resume/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        return data.items;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  createBricksBatch: async (payloads) => {
    try {
      if (payloads.length === 0) return true;

      const res = await fetchWithLoading(`/api/resume/bricks/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payloads }),
      });

      const data = await res.json();
      if (res.ok && data.ok && data.pendingReview) {
        return true;
      }
      return false;
    } catch (e) {
      console.error("Batch save failed:", e);
      return false;
    }
  },
}));
