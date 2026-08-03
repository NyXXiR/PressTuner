"use client";

import { create } from "zustand";
import type { AppNotification } from "@/components/notifications/types";

type Scope = "popover" | "all";

type ListState = {
  items: AppNotification[];
  loading: boolean;
  error: string | null;
};

type NotificationsStore = {
  inbox: ListState;
  popover: ListState;

  fetchList: (scope?: Scope) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  rejectInvitation: (invitationId: string) => Promise<void>;
  clearError: (scope?: Scope) => void;
};

// ---- type guards / helpers ----
function isInvitation(
  n: AppNotification
): n is Extract<AppNotification, { type: "INVITATION" }> {
  return n.type === "INVITATION";
}

export const useNotificationsStore = create<NotificationsStore>()(
  (set, get) => ({
    inbox: { items: [], loading: false, error: null },
    popover: { items: [], loading: false, error: null },

    clearError: (scope = "all") => {
      const target = scope === "all" ? "inbox" : "popover";
      set((s) => ({ [target]: { ...s[target], error: null } }));
    },

    fetchList: async (scope: Scope = "popover") => {
      const target = scope === "all" ? "inbox" : "popover";
      set((s) => ({ [target]: { ...s[target], loading: true, error: null } }));

      try {
        const res = await fetch(`/api/notifications?scope=${scope}`, {
          credentials: "include",
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
          set((s) => ({
            [target]: {
              ...s[target],
              loading: false,
              error: data?.message ?? data?.error ?? "알림을 불러오지 못했습니다.",
            },
          }));
          return;
        }

        set((s) => ({
          [target]: {
            items: (data.notifications ?? []) as AppNotification[],
            loading: false,
            error: null,
          },
        }));
      } catch {
        set((s) => ({
          [target]: { ...s[target], loading: false, error: "네트워크 오류" },
        }));
      }
    },

    // ✅ 읽음 처리: inbox와 popover 양쪽 배열 모두에서 해당 ID를 찾아 상태 업데이트
    markRead: async (id) => {
      const updateFn = (items: AppNotification[]) =>
        items.map((n) =>
          n.id === id
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n
        );

      set((s) => ({
        inbox: { ...s.inbox, items: updateFn(s.inbox.items) },
        popover: { ...s.popover, items: updateFn(s.popover.items) },
      }));

      try {
        const res = await fetch(`/api/notifications/${id}`, {
          method: "PATCH",
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || data?.ok !== true) {
          // 실패 시 최신 상태 재동기화
          void get().fetchList("all");
          void get().fetchList("popover");
        }
      } catch {
        void get().fetchList("all");
        void get().fetchList("popover");
      }
    },

    // ✅ 초대 수락: isActive를 false로 변경하여 '처리 필요' 목록에서 제거
    acceptInvitation: async (invitationId: string) => {
      const updateFn = (items: AppNotification[]) =>
        items.map((n) => {
          if (isInvitation(n) && n.invitationId === invitationId) {
            return { ...n, isActive: false };
          }
          return n;
        });

      set((s) => ({
        inbox: { ...s.inbox, items: updateFn(s.inbox.items) },
        popover: { ...s.popover, items: updateFn(s.popover.items) },
      }));

      try {
        const res = await fetch(`/api/team/invitations/${invitationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "ACCEPT" }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || data?.ok !== true) {
          void get().fetchList("all");
          void get().fetchList("popover");
          return;
        }
        // 최종 상태 재동기화
        void get().fetchList("all");
        void get().fetchList("popover");
      } catch {
        void get().fetchList("all");
        void get().fetchList("popover");
      }
    },

    // ✅ 초대 거부
    rejectInvitation: async (invitationId: string) => {
      const updateFn = (items: AppNotification[]) =>
        items.map((n) => {
          if (isInvitation(n) && n.invitationId === invitationId) {
            return { ...n, isActive: false };
          }
          return n;
        });

      set((s) => ({
        inbox: { ...s.inbox, items: updateFn(s.inbox.items) },
        popover: { ...s.popover, items: updateFn(s.popover.items) },
      }));

      try {
        const res = await fetch(`/api/team/invitations/${invitationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "REJECT" }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || data?.ok !== true) {
          void get().fetchList("all");
          void get().fetchList("popover");
          return;
        }
        void get().fetchList("all");
        void get().fetchList("popover");
      } catch {
        void get().fetchList("all");
        void get().fetchList("popover");
      }
    },
  })
);
