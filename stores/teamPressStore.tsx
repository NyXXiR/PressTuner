"use client";
import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";

export type TeamPressItem = {
  id: string;
  title: string;
  status: "BRIEF" | "DRAFT" | "IN_PROGRESS" | "FINAL" | "DECLINED";
  type: "PRESS_RELEASE";
  teamId: string | null;
  updatedAt: string;
  createdAt: string;
  user?: { id: string; label: string } | null;
};

type QueryState = {
  q: string;
  status: Array<"BRIEF" | "DRAFT" | "IN_PROGRESS" | "FINAL" | "DECLINED">;
  period: string | null; // ✅ [추가] 기간 필터
  page: number;
  pageSize: number;
};

type ListState = {
  items: TeamPressItem[];
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

export const useTeamPressStore = create<Store>()((set, get) => ({
  // ✅ [수정] period 초기값 null 설정
  query: { q: "", status: [], period: null, page: 1, pageSize: 10 },
  list: { items: [], total: 0, totalPages: 0, loading: false, error: null },
  selectedIds: [],

  setFilters: (patch) =>
    set((s) => ({ query: { ...s.query, ...patch, page: 1 } })),
  setPage: (page) => set((s) => ({ query: { ...s.query, page } })),
  setPageSize: (size) =>
    set((s) => ({ query: { ...s.query, pageSize: size, page: 1 } })),

  fetchList: async () => {
    const { query } = get();

    // --- [추가] 검색어 길이 제한 검사 ---
    if (query.q.length > 100) {
      set((s) => ({
        list: {
          ...s.list,
          loading: false,
          error: "검색어는 100자 이내로 입력해주세요.",
        },
      }));
      return;
    }

    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize));
    if (query.q) params.set("q", query.q);
    if (query.status.length > 0) params.set("status", query.status.join(","));

    // ✅ [추가] period 파라미터 전송
    if (query.period) params.set("period", query.period);

    set((s) => ({ list: { ...s.list, loading: true, error: null } }));

    try {
      const res = await fetchWithLoading(
        `/api/team/articles?${params.toString()}`,
        {
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => null);

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

      set(() => ({
        list: {
          items: data.items ?? [],
          total: data.total ?? 0,
          totalPages: data.totalPages ?? 0,
          loading: false,
          error: null,
        },
        selectedIds: [],
      }));
    } catch {
      set((s) => ({
        list: { ...s.list, loading: false, error: "네트워크 오류" },
      }));
    }
  },

  deleteOne: async (id: string) => {
    try {
      const res = await fetchWithLoading(`/api/team/articles/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.ok === false)) return;
      await get().fetchList();
    } catch {}
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
      const res = await fetchWithLoading(`/api/team/articles/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.ok === false)) return;

      await get().fetchList();
    } catch {}
  },
}));
