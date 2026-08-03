"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  ArrowRight,
  FilePlus2,
  Loader2,
} from "lucide-react";

import { StatusBadge, type BadgeVariant } from "@/components/ui/status-badge";
import { STATUS_LABEL } from "@/lib/constants/articleConstants";
import { formatYMDHMFromISO } from "@/lib/utils/datetime";
import { useMyDashboardStore } from "@/stores/myDashboardStore";
import { useMeStore } from "@/stores/useMeStore";
import { PageHeader } from "@/components/page/PageHeader";
import { PageCTA, PageCTAGroup } from "@/components/page/PageCTA";

function statusLabel(status: string) {
  return STATUS_LABEL[status as keyof typeof STATUS_LABEL] || status;
}

function badgeVariantFromPressStatus(status: string): BadgeVariant {
  switch (status) {
    case "FINAL":
      return "emerald";
    case "IN_PROGRESS":
      return "blue";
    case "DRAFT":
    default:
      return "neutral";
  }
}

function workHref(id: string, status: string) {
  return status === "FINAL" ? `/press/${id}/final` : `/press/${id}/edit`;
}

export default function MyDashboardPage() {
  const { me, loading: meLoading } = useMeStore();
  const {
    recent,
    summary,
    loading: dashboardLoading,
    fetchDashboard,
    clearRecent,
  } = useMyDashboardStore();

  useEffect(() => {
    if (meLoading || !me?.userId) return;
    fetchDashboard();
  }, [meLoading, me?.userId, fetchDashboard]);

  if (meLoading || !me) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recentItems = recent.slice(0, 5);

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="brieFFlow Press"
          title="보도자료 작업 현황"
          description="최근 작업과 이번 달 작성 현황만 빠르게 확인합니다."
        />
        <PageCTAGroup>
          <PageCTA href="/my/articles" variant="secondary">
            보도자료 목록
          </PageCTA>
          <PageCTA href="/press/new">
            <FilePlus2 className="h-4 w-4" />
            새 보도자료 작성
          </PageCTA>
        </PageCTAGroup>
      </header>

      <section
        aria-label="작업 요약"
        className="mt-10 grid grid-cols-3 divide-x divide-border border-y border-border"
      >
        <Link href="/my/articles?period=current_month" className="block">
          <div className="px-4 py-5 sm:px-6">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
              이번 달 생성
            </p>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">
              {summary?.monthCreated ?? 0}
              <span className="ml-1 text-base font-semibold text-muted-foreground">
                건
              </span>
            </p>
            <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
              이번 달 새로 만든 문서
            </p>
          </div>
        </Link>
        <Link href="/my/articles?status=FINAL&period=current_month" className="block">
          <div className="px-4 py-5 sm:px-6">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
              이번 달 완료
            </p>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">
              {summary?.monthFinalized ?? 0}
              <span className="ml-1 text-base font-semibold text-muted-foreground">
                건
              </span>
            </p>
            <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
              이번 달 완료한 문서
            </p>
          </div>
        </Link>
        <Link href="/my/articles" className="block">
          <div className="px-4 py-5 sm:px-6">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
              최근 작업
            </p>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">
              {recentItems.length}
              <span className="ml-1 text-base font-semibold text-muted-foreground">
                건
              </span>
            </p>
            <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
              바로 이어서 작성
            </p>
          </div>
        </Link>
      </section>

      <section className="mt-10" aria-labelledby="recent-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="recent-title" className="text-lg font-extrabold tracking-tight">
              최근 작업
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              이어서 다듬거나 완료된 문서를 다시 엽니다.
            </p>
          </div>
          {recentItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!confirm("최근 작업 이력을 비울까요?")) return;
                clearRecent();
              }}
              className="text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              이력 비우기
            </button>
          )}
        </div>

        <div className="mt-3 border-t-2 border-foreground">
          {dashboardLoading && recentItems.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center border-b border-border">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : recentItems.length === 0 ? (
            <div className="border-b border-border py-10 text-center">
              <p className="text-sm font-semibold text-foreground">
                아직 작업한 보도자료가 없습니다
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                첫 보도자료를 만들면 이곳에서 바로 이어서 작업할 수 있습니다.
              </p>
              <div className="mt-4">
                <PageCTA href="/press/new">새 보도자료 작성</PageCTA>
              </div>
            </div>
          ) : (
            <ul>
              {recentItems.map((press) => {
                const href = workHref(press.id, press.status);
                const actionLabel = press.status === "FINAL" ? "열기" : "이어쓰기";

                return (
                  <li key={press.id} className="border-b border-border">
                    <Link
                      href={href}
                      className="group flex flex-col gap-3 px-1 py-4 transition-colors hover:bg-primary/[0.03] sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-sm font-bold text-foreground">
                            {press.title || "제목 없음"}
                          </h3>
                          <StatusBadge variant={badgeVariantFromPressStatus(press.status)}>
                            {statusLabel(press.status)}
                          </StatusBadge>
                        </div>
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          최종 업데이트 {formatYMDHMFromISO(press.updatedAt)}
                        </p>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        {actionLabel}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
