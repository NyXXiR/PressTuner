"use client";

import { create } from "zustand";

export type RecentItem = {
  id: string;
  title: string;
  status: "DRAFT" | "IN_PROGRESS" | "FINAL";
  updatedAt: string;
  teamName?: string; // ✅ 추가: 어느 팀 작업인지 표시
};

export type ReviewItem = {
  // ✅ 추가: 검토 요청 타입
  id: string;
  articleId: string;
  title: string;
  requester: string;
  teamName: string;
  assignedAt: string;
};

export type DashboardSummary = {
  pendingDrafts: number;
  monthCreated: number;
  monthFinalized: number;
};

type DashboardState = {
  recent: RecentItem[];
  reviews: ReviewItem[]; // ✅ 검토 목록 추가
  summary: DashboardSummary | null;
  loading: boolean;
  error?: string | null;

  fetchDashboard: () => Promise<void>;
  clearRecent: () => Promise<void>;
};

export const useMyDashboardStore = create<DashboardState>()((set) => ({
  recent: [],
  reviews: [],
  summary: null,
  loading: false,
  error: null,

  fetchDashboard: async () => {
    set({ loading: true, error: null });

    try {
      // teamId가 있으면 쿼리스트링에 추가, 없으면 전체 조회
      const res = await fetch(`/api/my/dashboard`, {
        method: "GET",
      });

      if (!res.ok) throw new Error("데이터 로드 실패");

      const data = await res.json();

      set({
        summary: data.summary,
        recent: data.recent,
        reviews: data.reviews, // 서버에서 받은 검토 목록
        loading: false,
      });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  clearRecent: async () => {
    set({ loading: true, error: null });

    try {
      // API 엔드포인트는 프로젝트의 설계에 맞춰 조정하세요.
      // 보통 DELETE 메소드를 사용하거나 POST로 상태를 변경합니다.
      const res = await fetch(`/api/my/dashboard/recent/clear`, {
        method: "POST", // 또는 DELETE
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("이력을 비우지 못했습니다.");

      // 성공 시 클라이언트 상태의 recent 배열을 비웁니다.
      set({ recent: [], loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      alert(e.message); // 사용자 알림용
    }
  },
}));
