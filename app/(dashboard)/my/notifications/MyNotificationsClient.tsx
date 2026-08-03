"use client";

import Link from "next/link";
import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useNotificationsStore } from "@/stores/notificationsStore";
import type { AppNotification } from "@/components/notifications/types";
import {
  Bell,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Inbox,
  UserPlus,
} from "lucide-react";

// --- Helpers ---
function toDateString(v: unknown) {
  try {
    const d = new Date(v as any);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

type InvitationNotification = Extract<AppNotification, { type: "INVITATION" }>;
type GeneralNotification = Exclude<AppNotification, { type: "INVITATION" }>;

function isInvitation(n: AppNotification): n is InvitationNotification {
  return n.type === "INVITATION";
}

function isActiveNotification(n: AppNotification) {
  return (n as any).isActive !== false;
}

function isRead(n: AppNotification) {
  const anyN = n as any;
  return anyN.isRead === true || !!anyN.readAt;
}

function hasHref(
  n: GeneralNotification
): n is GeneralNotification & { href: string } {
  const anyN = n as any;
  return typeof anyN.href === "string" && anyN.href.length > 0;
}

export default function MyNotificationsClient() {
  const router = useRouter();
  // inbox 상태를 사용함
  const { inbox, fetchList, markRead, acceptInvitation, rejectInvitation } =
    useNotificationsStore();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // 페이지 진입 시 전체 목록(all)을 불러옴
    fetchList("all");
  }, [fetchList]);

  const items = inbox.items;

  const pendingInvites = useMemo(
    () =>
      items.filter(
        (n): n is InvitationNotification =>
          isInvitation(n) && isActiveNotification(n)
      ),
    [items]
  );

  const unreadGeneral = useMemo(
    () =>
      items.filter(
        (n): n is GeneralNotification =>
          !isInvitation(n) && isActiveNotification(n) && !isRead(n)
      ),
    [items]
  );

  const readGeneral = useMemo(
    () =>
      items.filter(
        (n): n is GeneralNotification =>
          !isInvitation(n) && isActiveNotification(n) && isRead(n)
      ),
    [items]
  );

  const openUnread = (n: GeneralNotification) => {
    startTransition(() => {
      void markRead(n.id); // store에서 inbox/popover 동시 처리
      if (hasHref(n)) router.push(n.href);
    });
  };

  return (
    <div className="space-y-10">
      <section>
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-primary" />
            <h2 className="text-base font-semibold">처리 필요</h2>
            <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {pendingInvites.length}
            </span>
          </div>
          <button
            onClick={() => fetchList("all")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw
              size={12}
              className={inbox.loading ? "animate-spin" : ""}
            />
            새로고침
          </button>
        </header>

        {pendingInvites.length === 0 ? (
          <div className="border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              대기 중인 팀 초대 요청이 없습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingInvites.map((n) => (
              <div
                key={n.id}
                className="border border-primary/20 bg-primary/5 p-6 animate-in fade-in slide-in-from-top-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      <span className="text-primary">
                        {(n as any).teamName}
                      </span>{" "}
                      팀 초대 요청
                    </p>
                    <p className="text-xs text-muted-foreground">
                      보낸 사람: {(n as any).inviterLabel} •{" "}
                      {toDateString((n as any).createdAt)}
                    </p>
                    {(n as any).message && (
                      <p className="mt-3 text-sm text-foreground/80 bg-background/50 p-3 border border-primary/10 italic leading-relaxed">
                        &quot;{(n as any).message}&quot;
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(
                          () => void rejectInvitation((n as any).invitationId)
                        )
                      }
                      className="h-10 px-4 border border-border bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition-all disabled:opacity-50"
                    >
                      거절
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(
                          () => void acceptInvitation((n as any).invitationId)
                        )
                      }
                      className="h-10 px-5 bg-primary text-sm font-bold text-primary-foreground shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
                    >
                      수락하기
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold">안 읽은 알림</h2>
          </div>
        </header>

        {unreadGeneral.length === 0 ? (
          <div className="border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              모든 알림을 읽었습니다.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {unreadGeneral.map((n: any) => (
              <button
                key={n.id}
                onClick={() => openUnread(n)}
                className="w-full text-left group border border-border bg-card p-5 transition-all hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-bold group-hover:text-primary transition-colors">
                      {n.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Clock size={10} /> {toDateString(n.createdAt)}
                    </div>
                    {n.body && (
                      <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {n.body}
                      </div>
                    )}
                  </div>
                  {hasHref(n) && (
                    <div className="h-8 w-8 bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                      <ExternalLink size={14} />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <header className="mb-4 flex items-center gap-2">
          <Inbox size={18} className="text-muted-foreground" />
          <h2 className="text-base font-semibold">지난 알림 기록</h2>
        </header>

        {readGeneral.length === 0 ? (
          <div className="border border-border bg-muted/10 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              기록된 알림이 없습니다.
            </p>
          </div>
        ) : (
          <div className="border border-border bg-card overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-muted/30 border-b border-border">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-4 w-[140px]">시간</th>
                  <th className="px-6 py-4">알림 내용</th>
                  <th className="px-6 py-4 w-[100px] text-right">구분</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {readGeneral.map((n: any) => (
                  <tr
                    key={n.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-6 py-4 text-[11px] text-muted-foreground">
                      {toDateString(n.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {hasHref(n) ? (
                        <Link
                          href={n.href}
                          className="hover:underline font-medium"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground/80">
                          {n.title}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[10px] text-right">
                      <span className="inline-block px-2 py-0.5 bg-muted text-muted-foreground font-bold">
                        {n.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inbox.error && (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-600 flex items-center gap-2">
          <XCircle size={16} /> {inbox.error}
        </div>
      )}
    </div>
  );
}
