// components/notifications/NotificationPopover.tsx
"use client";

import { useRouter } from "next/navigation";
import type { AppNotification } from "./types";
import { useState } from "react";
import { useNotificationsStore } from "@/stores/notificationsStore";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onRefresh?: () => Promise<void>;
  onAfterAccept?: () => Promise<void>;
};

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export function NotificationPopover({
  isOpen,
  onClose,
  notifications,
  onRefresh,
  onAfterAccept,
}: Props) {
  const router = useRouter();

  const markRead = useNotificationsStore((s) => s.markRead);
  const acceptInvitation = useNotificationsStore((s) => s.acceptInvitation);
  const rejectInvitation = useNotificationsStore((s) => s.rejectInvitation);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const goNotifications = () => {
    onClose();
    router.push("/my/notifications");
  };

  const respondInvitation = async (
    invitationId: string,
    action: "ACCEPT" | "REJECT"
  ) => {
    setBusyId(invitationId);
    try {
      if (action === "ACCEPT") {
        await acceptInvitation(invitationId);
        if (onAfterAccept) await onAfterAccept();
      } else {
        await rejectInvitation(invitationId);
      }

      if (onRefresh) await onRefresh();
    } catch (e) {
      console.error(e);
      alert("네트워크 오류");
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (busyAll) return;

    // ✅ 초대는 제외하고 모두 읽음 처리
    const ids = (notifications ?? [])
      .filter((n) => n.type !== "INVITATION")
      .map((n) => n.id);

    if (ids.length === 0) return;

    setBusyAll(true);
    try {
      await Promise.allSettled(ids.map((id) => markRead(id)));
      if (onRefresh) await onRefresh();
    } catch (e) {
      console.error(e);
      alert("처리에 실패했습니다.");
    } finally {
      setBusyAll(false);
    }
  };

  if (!isOpen) return null;

  const visible = (notifications ?? []).filter((n) => {
    // 이미 처리된(수락/거절) 항목이나 비활성 항목은 숨김
    if (n.isActive === false) return false;

    // 초대는 '읽음' 여부와 상관없이 수락/거절하기 전까지 계속 보여줌
    if (n.type === "INVITATION") return true;

    // 나머지(LINK, INFO, NOTICE)는 '읽지 않음(false)' 상태일 때만 보여줌
    return !n.isRead;
  });

  const markAllDisabled =
    busyAll || visible.filter((n) => n.type !== "INVITATION").length === 0;

  return (
    <div
      // ✅ 핵심: !absolute 로 "포지션 덮어쓰기"를 원천 봉쇄
      className="
        !absolute right-0 top-10 z-[80]
        w-[360px] max-w-[90vw]
        border border-border
        bg-card shadow-lg
        overflow-visible pt-overflow-visible
      "
      role="dialog"
      aria-label="알림"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 dark:border-white/10">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[12px] font-semibold">알림</p>
          <p className="text-[11px] text-muted-foreground">
            {visible.length}건
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllRead}
            disabled={markAllDisabled}
            className="
              h-7 px-2.5
              border border-border/40 dark:border-white/10
              text-[11px] text-muted-foreground
              hover:bg-muted disabled:opacity-60
            "
            title="초대는 제외하고 모두 읽음 처리"
          >
            {busyAll ? "처리 중…" : "모두 읽음"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 border border-border/40 dark:border-white/10 text-xs text-muted-foreground hover:bg-muted"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="p-3">
        {visible.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            받은 알림이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {visible.slice(0, 8).map((n) => {
              if (n.type === "INVITATION") {
                const disabled = busyId === n.invitationId;
                return (
                  <div
                    key={n.id}
                    className="border border-border/40 dark:border-white/10 p-3"
                  >
                    <p className="text-[12px]">
                      <span className="font-medium">{n.teamName}</span> 팀 초대
                      ·{" "}
                      <span className="text-muted-foreground">
                        from {n.inviterLabel}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(n.createdAt)}
                    </p>
                    {n.message ? (
                      <p className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
                        {n.message}
                      </p>
                    ) : null}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          respondInvitation(n.invitationId, "REJECT")
                        }
                        disabled={disabled}
                        className="flex-1 h-9 border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted disabled:opacity-60"
                      >
                        거부
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          respondInvitation(n.invitationId, "ACCEPT")
                        }
                        disabled={disabled}
                        className="flex-1 h-9 bg-primary text-primary-foreground text-[12px] hover:opacity-90 disabled:opacity-60"
                      >
                        수락
                      </button>
                    </div>
                  </div>
                );
              }

              if (n.type === "NOTICE") {
                return (
                  <div
                    key={n.id}
                    className="border border-border/40 dark:border-white/10 p-3"
                  >
                    <p className="text-[12px] font-medium">{n.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(n.createdAt)}
                    </p>
                    {n.body ? (
                      <p className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap line-clamp-3">
                        {n.body}
                      </p>
                    ) : null}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await markRead(n.id);
                          onClose();
                          router.push(n.href);
                        }}
                        className="flex-1 h-9 border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted"
                      >
                        공지 보기
                      </button>
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="h-9 w-16 border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                );
              }

              if (n.type === "INFO") {
                return (
                  <div
                    key={n.id}
                    className="border border-border/40 dark:border-white/10 p-3"
                  >
                    <p className="text-[12px] font-medium">{n.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(n.createdAt)}
                    </p>
                    {n.body ? (
                      <p className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
                        {n.body}
                      </p>
                    ) : null}

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="h-9 w-full border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted"
                      >
                        확인
                      </button>
                    </div>
                  </div>
                );
              }

              // LINK
              return (
                <div
                  key={n.id}
                  className="border border-border/40 dark:border-white/10 p-3"
                >
                  <p className="text-[12px] font-medium">{n.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(n.createdAt)}
                  </p>
                  {n.body ? (
                    <p className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
                      {n.body}
                    </p>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await markRead(n.id);
                        onClose();
                        router.push(n.href);
                      }}
                      className="flex-1 h-9 border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted"
                    >
                      열기
                    </button>
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      className="h-9 w-16 border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 CTA */}
      <div className="p-3 pt-0">
        <button
          type="button"
          onClick={goNotifications}
          className="w-full h-10 border border-border/40 dark:border-white/10 text-[12px] hover:bg-muted"
        >
          알림 모두 보기
        </button>
      </div>
    </div>
  );
}
