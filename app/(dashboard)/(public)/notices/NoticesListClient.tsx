// app/notices/NoticesListClient.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Trash2 } from "lucide-react";

type Item = {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  sendAsNotification: boolean;
};

export default function NoticesListClient({
  items,
  isAdmin,
  basePath = "/notices",
  variant = "default",
}: {
  items: Item[];
  isAdmin: boolean;
  basePath?: string;
  variant?: "default" | "compact";
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const isCompact = variant === "compact";

  const remove = async (id: string) => {
    const ok = confirm("이 공지사항을 삭제할까요? (되돌릴 수 없습니다)");
    if (!ok) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/notices/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || data?.ok === false) {
        alert(data?.message ?? data?.error ?? "삭제에 실패했습니다.");
        return;
      }

      router.refresh();
    } catch (e) {
      console.error(e);
      alert("네트워크 오류");
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="border-b border-border py-12 text-center">
        <Bell className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-sm font-bold text-foreground">
          공지사항이 없습니다
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          등록된 운영 공지가 없습니다.
        </p>
        {isAdmin ? (
          <Link
            href={`${basePath}/new`}
            className="mt-4 inline-flex h-9 items-center bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            공지 작성하기
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-4 inline-flex h-9 items-center border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
          >
            새로고침
          </button>
        )}
      </div>
    );
  }

  return (
    <ul>
      {items.map((notice) => {
        const disabled = busyId === notice.id;
        const href = `${basePath}/${notice.id}`;

        return (
          <li
            key={notice.id}
            className="border-b border-border"
          >
            <div className="group flex items-start gap-3 px-1 py-4 transition-colors hover:bg-primary/[0.03] sm:items-center sm:gap-4 sm:py-5">
              <Link href={href} className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 truncate text-sm font-bold text-foreground">
                    {notice.title}
                  </h2>
                  {notice.sendAsNotification ? (
                    <span className="inline-flex shrink-0 items-center border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      알림
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {notice.preview || "내용 미리보기가 없습니다."}
                </p>
                <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {new Date(notice.createdAt).toLocaleString()}
                </p>
              </Link>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => remove(notice.id)}
                  disabled={disabled}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                  aria-label={`${notice.title} 삭제`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <Link
                  href={href}
                  className="hidden shrink-0 items-center gap-1 text-xs font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline-flex"
                >
                  보기
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
