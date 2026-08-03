"use client";

import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";

export type ResumeApplicationStatus = "WRITING" | "DONE";

export type ResumeApplicationItem = {
  id: string;
  companyName: string;
  jobTitle: string;
  status: ResumeApplicationStatus;
  updatedAt: string;
  createdAt: string;
  _count: { questions: number }; // 문항 수
};

type QueryState = {
  q: string;
  status: ResumeApplicationStatus[];
  page: number;
  pageSize: number;
};

type ListState = {
  items: ResumeApplicationItem[];
  total: number;
  totalPages: number;
  loading: boolean;
  error?: string | null;
};

type Store = {
  query: QueryState;
  list: ListState;
  selectedIds: string[];

  setFilters: (patch: Partial<Omit<QueryState, "page" | "pageSize">>) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  fetchList: () => Promise<void>;
  deleteOne: (id: string) => Promise<void>;
  toggleOne: (id: string) => void;
  setAllOnPage: (idsOnPage: string[], checked: boolean) => void;
  clearSelection: () => void;
  bulkDeleteSelected: () => Promise<void>;
};

let applicationListRequestSeq = 0;

export const useResumeApplicationListStore = create<Store>()((set, get) => ({
  query: {
    q: "",
    status: ["WRITING"], // 기본값: 작성 중
    page: 1,
    pageSize: 10,
  },

  list: { items: [], total: 0, totalPages: 0, loading: false, error: null },
  selectedIds: [],

  setFilters: (patch) =>
    set((s) => ({ query: { ...s.query, ...patch, page: 1 } })),
  setPage: (page) => set((s) => ({ query: { ...s.query, page } })),
  setPageSize: (size) =>
    set((s) => ({ query: { ...s.query, pageSize: size, page: 1 } })),

  fetchList: async () => {
    const { query } = get();
    const requestSeq = ++applicationListRequestSeq;
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize));
    if (query.q) params.set("q", query.q);
    if (query.status.length > 0) params.set("status", query.status.join(","));

    set((s) => ({ list: { ...s.list, loading: true, error: null } }));

    try {
      const res = await fetchWithLoading(
        `/api/resume/applications?${params.toString()}`,
        {
          credentials: "include",
        }
      );
      const data = await res.json().catch(() => null);
      if (requestSeq !== applicationListRequestSeq) return;

      if (!res.ok || !data) {
        set((s) => ({
          list: {
            ...s.list,
            loading: false,
            error: data?.message ?? data?.error ?? "목록을 불러오지 못했습니다.",
          },
        }));
        return;
      }

      const items = data.items ?? [];
      const total = data.total ?? 0;
      const totalPages = data.totalPages ?? 0;
      if (items.length === 0 && total > 0 && query.page > Math.max(1, totalPages)) {
        set((s) => ({
          query: { ...s.query, page: Math.max(1, totalPages) },
          list: { ...s.list, loading: false, error: null },
        }));
        await get().fetchList();
        return;
      }

      set(() => ({
        list: {
          items,
          total,
          totalPages,
          loading: false,
          error: null,
        },
        selectedIds: [],
      }));
    } catch {
      if (requestSeq !== applicationListRequestSeq) return;
      set((s) => ({
        list: { ...s.list, loading: false, error: "네트워크 오류" },
      }));
    }
  },

  deleteOne: async (id: string) => {
    try {
      const res = await fetchWithLoading(`/api/resume/applications/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.ok === false)) {
        set((s) => ({
          list: {
            ...s.list,
            error: data?.message ?? data?.error ?? "지원서를 삭제하지 못했습니다.",
          },
        }));
        return;
      }
      await get().fetchList();
    } catch {
      set((s) => ({
        list: { ...s.list, error: "지원서를 삭제하지 못했습니다." },
      }));
    }
  },

  toggleOne: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id);
      return {
        selectedIds: has
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      };
    }),

  setAllOnPage: (idsOnPage, checked) =>
    set((s) => ({
      selectedIds: checked
        ? Array.from(new Set([...s.selectedIds, ...idsOnPage]))
        : s.selectedIds.filter((id) => !idsOnPage.includes(id)),
    })),

  clearSelection: () => set({ selectedIds: [] }),

  bulkDeleteSelected: async () => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;

    try {
      const res = await fetchWithLoading(
        `/api/resume/applications/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }
      );

      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.ok === false)) {
        set((s) => ({
          list: {
            ...s.list,
            error: data?.message ?? data?.error ?? "선택한 지원서를 삭제하지 못했습니다.",
          },
        }));
        return;
      }

      await get().fetchList();
    } catch {
      set((s) => ({
        list: { ...s.list, error: "선택한 지원서를 삭제하지 못했습니다." },
      }));
    }
  },
}));
