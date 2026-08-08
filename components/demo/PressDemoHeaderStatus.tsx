"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HeaderStatus =
  | { kind: "checking" }
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      userLabel: string;
      teamName: string;
      articleRemaining: number | null;
      articleUnlimited: boolean;
    };

/**
 * The demo pages ship a static marketing header; this slot is the only part
 * that depends on the session, so it hydrates alone instead of making the
 * whole header dynamic.
 */
export function PressDemoHeaderStatus() {
  const [status, setStatus] = useState<HeaderStatus>({ kind: "checking" });
  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return setStatus({ kind: "anonymous" });
        const value = await response.json();
        setStatus({
          kind: "authenticated",
          userLabel: String(value?.user?.label ?? value?.user?.loginId ?? ""),
          teamName: String(value?.team?.name ?? ""),
          articleRemaining:
            typeof value?.usage?.article?.remaining === "number"
              ? value.usage.article.remaining
              : null,
          articleUnlimited: Boolean(value?.usage?.article?.unlimited),
        });
      })
      .catch(() => setStatus({ kind: "anonymous" }));
  }, []);

  if (status.kind === "checking")
    return <div aria-hidden="true" className="h-9 w-40 animate-pulse rounded-full bg-muted" />;

  if (status.kind === "anonymous")
    return (
      <div className="flex items-center gap-3">
        <span className="hidden text-xs font-semibold text-muted-foreground sm:inline">
          로그인 후 실제 실행
        </span>
        <Link
          href="/login"
          className="border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          로그인
        </Link>
      </div>
    );

  return (
    // On a 390px header the full team + quota string crowded out the logo.
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-border py-1.5 pl-2 pr-2 text-xs font-bold sm:pr-4">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-black text-primary-foreground"
      >
        {status.userLabel.slice(0, 1) || "?"}
      </span>
      <span className="hidden min-w-0 truncate sm:inline">
        {status.teamName}
        {status.userLabel ? ` · ${status.userLabel}` : ""}
      </span>
      <span className="hidden shrink-0 font-semibold text-muted-foreground md:inline">
        {status.articleUnlimited
          ? "Press 할당량 무제한"
          : status.articleRemaining !== null
            ? `Press 할당량 ${status.articleRemaining} 남음`
            : null}
      </span>
    </div>
  );
}
