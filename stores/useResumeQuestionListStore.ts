"use client";

import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";

// ✅ 문항 단위 아이템 타입 정의
export type ResumeQuestionItem = {
  id: string;
  questionText: string;
  answer: string | null;
  isCompleted: boolean;
  charLimit: number | null;
  updatedAt: string;
  // ✅ 역참조된 지원서 정보
  application: {
    id: string;
    companyName: string;
    jobTitle: string;
    status: string;
  };
};

type QueryState = {
  q: string; // 질문 내용 or 기업명 검색
  filter: "ALL" | "COMPLETED" | "PENDING"; // 답변 완료 여부 필터
  page: number;
  pageSize: number;
};

type ListState = {
  items: ResumeQuestionItem[];
  total: number;
  totalPages: number;
  loading: boolean;
  error?: string | null;
};

type Store = {
  query: QueryState;
  list: ListState;

  setFilters: (patch: Partial<Omit<QueryState, "page" | "pageSize">>) => void;
  setPage: (page: number) => void;
  fetchList: () => Promise<void>;
};

export const useResumeQuestionListStore = create<Store>()((set, get) => ({
  query: {
    q: "",
    filter: "ALL",
    page: 1,
    pageSize: 10,
  },

  list: { items: [], total: 0, totalPages: 0, loading: false, error: null },

  setFilters: (patch) =>
    set((s) => ({ query: { ...s.query, ...patch, page: 1 } })),

  setPage: (page) => set((s) => ({ query: { ...s.query, page } })),

  fetchList: async () => {
    const { query } = get();
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize));
    if (query.q) params.set("q", query.q);
    if (query.filter !== "ALL") params.set("filter", query.filter);

    set((s) => ({ list: { ...s.list, loading: true, error: null } }));

    try {
      // ✅ 문항 목록을 가져오는 API (구현 필요: GET /api/resume/questions)
      const res = await fetchWithLoading(
        `/api/resume/questions?${params.toString()}`,
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        set((s) => ({
          list: {
            ...s.list,
            loading: false,
            error: data?.message ?? data?.error ?? "오류 발생",
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
      }));
    } catch {
      set((s) => ({
        list: { ...s.list, loading: false, error: "네트워크 오류" },
      }));
    }
  },
}));
