"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  Layers,
  Loader2,
  PenLine,
} from "lucide-react";

import { fetchWithLoading } from "@/lib/fetchWithLoading";
import { useResumeWriteStore } from "@/stores/useResumeWriteStore";
import { useResumeBrickStore } from "@/stores/resume/useResumeBrickStore";

type ApplicationSummary = {
  id: string;
  companyName: string;
  jobTitle: string;
  status: "WRITING" | "DONE" | "SUBMITTED";
  updatedAt: string;
  _count?: { questions: number };
};

function formatYMD(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "날짜 없음";
  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

const TUTORIAL_SEEN_KEY = "presstuner.resume-write-tutorial-seen:v1";

function MiniStamp() {
  return (
    <span
      aria-label="완료"
      className="wg-stamp h-6 w-6 shrink-0 text-[9px] tracking-normal"
      style={{ borderWidth: 2, boxShadow: "none" }}
    >
      完
    </span>
  );
}

function StatusMark({ status }: { readonly status: ApplicationSummary["status"] }) {
  if (status === "DONE") return <MiniStamp />;
  if (status === "SUBMITTED") {
    return (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="제출됨" />
    );
  }
  return <PenLine className="h-5 w-5 shrink-0 text-primary" aria-label="작성 중" />;
}

export default function ResumeDashboardPage() {
  const resetWriteStore = useResumeWriteStore((s) => s.reset);
  const { list, fetchList: fetchBricks } = useResumeBrickStore();
  const [apps, setApps] = useState<ApplicationSummary[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [writeHref] = useState(() => {
    if (typeof window === "undefined") return "/resume/write";
    const seen = window.sessionStorage.getItem(TUTORIAL_SEEN_KEY);
    return seen ? "/resume/write" : "/resume/write?tutorial=1";
  });
  const brickCount = list.total ?? list.items.length;
  const hasBricks = brickCount > 0;
  const primaryLabel = hasBricks ? "새 지원서 작성" : "경험 먼저 추가";
  const primaryHref = hasBricks ? writeHref : "/resume/bricks?onboarding=true";

  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      setIsLoading(true);
      setDashboardError(null);
      try {
        const [listRes, statsRes] = await Promise.all([
          fetchWithLoading("/api/resume/applications?page=1&pageSize=5"),
          fetchWithLoading("/api/resume/dashboard"),
        ]);

        const listData = await listRes.json().catch(() => null);
        const statsData = await statsRes.json().catch(() => null);
        if (cancelled) return;

        if (listRes.ok && listData?.ok) {
          setApps(Array.isArray(listData.items) ? listData.items : []);
        } else {
          setApps([]);
          setDashboardError("최근 지원서 목록을 불러오지 못했습니다.");
        }

        if (statsRes.ok && statsData?.ok) {
          setCompletedCount(statsData.stats?.thisMonthCompleted ?? 0);
        }
      } catch {
        if (!cancelled) {
          setApps([]);
          setDashboardError(
            "대시보드 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadDashboardData();
    void fetchBricks();

    return () => {
      cancelled = true;
    };
  }, [fetchBricks]);

  const writingCount = useMemo(
    () => apps.filter((app) => app.status === "WRITING").length,
    [apps],
  );
  const continueApp = useMemo(
    () => apps.find((app) => app.status === "WRITING") ?? null,
    [apps],
  );

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <section aria-labelledby="dash-title">
        <p className="text-[11px] font-bold tracking-[0.18em] text-primary">
          오늘의 책상
        </p>
        {isLoading ? (
          <div className="mt-4 flex h-40 items-center justify-center border border-dashed border-border">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : !hasBricks ? (
          <>
            <h1
              id="dash-title"
              className="mt-3 text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl"
            >
              먼저 경험 재료부터 모아볼까요?
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              경험 브릭이 있어야 초안 품질이 좋아집니다. 이력서 PDF를 올리거나 핵심
              경험 몇 개만 직접 정리하면 준비 끝입니다.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                href={primaryHref}
                onClick={() => resetWriteStore()}
                className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Layers className="h-4 w-4" aria-hidden="true" />
                {primaryLabel}
              </Link>
              <Link
                href={writeHref}
                onClick={() => resetWriteStore()}
                className="inline-flex h-12 items-center justify-center gap-2 border border-border bg-card px-6 text-sm font-bold transition-colors hover:bg-muted"
              >
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                경험 없이 바로 시작
              </Link>
            </div>
          </>
        ) : continueApp ? (
          <>
            <h1
              id="dash-title"
              className="mt-3 text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl"
            >
              책상 위에 쓰던 지원서가 있어요
            </h1>
            <div className="mt-5 flex flex-col gap-4 border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold tracking-tight">
                  {continueApp.companyName || "회사명 없음"}
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    {continueApp.jobTitle || "직무 없음"}
                  </span>
                </p>
                <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  문항 {continueApp._count?.questions ?? 0}개 · 마지막 작업{" "}
                  {formatYMD(continueApp.updatedAt)}
                </p>
              </div>
              <Link
                href={`/resume/write?id=${continueApp.id}`}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                이어쓰기
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {writingCount > 1
                  ? `이 외에 작성 중인 지원서가 ${writingCount - 1}건 더 있어요.`
                  : "새 지원서는 언제든 시작할 수 있어요."}
              </p>
              <Link
                href={primaryHref}
                onClick={() => resetWriteStore()}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 border border-border bg-card px-3 text-xs font-bold transition-colors hover:bg-muted"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                {primaryLabel}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1
              id="dash-title"
              className="mt-3 text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl"
            >
              새 지원서를 시작할 준비가 됐어요
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              경험 브릭 {brickCount}개가 준비되어 있습니다. 공고를 붙여넣으면 문항
              정리부터 초안까지 한 흐름으로 이어집니다.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                href={primaryHref}
                onClick={() => resetWriteStore()}
                className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                {primaryLabel}
              </Link>
              <Link
                href="/resume/bricks?onboarding=true"
                className="inline-flex h-12 items-center justify-center gap-2 border border-border bg-card px-6 text-sm font-bold transition-colors hover:bg-muted"
              >
                <Layers className="h-4 w-4" aria-hidden="true" />
                경험 추가
              </Link>
            </div>
          </>
        )}
      </section>

      <section
        aria-label="자산 현황"
        className="mt-10 grid grid-cols-3 divide-x divide-border border-y border-border"
      >
        <div className="px-4 py-5 sm:px-6">
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
            경험 브릭
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">
            {brickCount}
          </p>
          <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
            답변에 재사용할 재료
          </p>
        </div>
        <div className="px-4 py-5 sm:px-6">
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
            작성 중
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums">
            {writingCount}
          </p>
          <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
            최근 목록 기준
          </p>
        </div>
        <div className="px-4 py-5 sm:px-6">
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
            이번 달 완료
          </p>
          <p className="mt-2 flex items-center gap-2.5 font-mono text-3xl font-extrabold tabular-nums">
            {completedCount}
            {completedCount > 0 && <MiniStamp />}
          </p>
          <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
            마무리한 자기소개서
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="recent-title">
        <div className="flex items-end justify-between gap-3">
          <h2 id="recent-title" className="text-lg font-extrabold tracking-tight">
            최근 지원서
          </h2>
          <Link
            href="/resume/applications"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-opacity hover:opacity-80"
          >
            전체 목록
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-3 border-t-2 border-foreground">
          {dashboardError ? (
            <p className="border-b border-border py-4 text-sm font-semibold text-destructive">
              {dashboardError}
            </p>
          ) : isLoading ? (
            <div className="flex min-h-32 items-center justify-center border-b border-border">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : apps.length === 0 ? (
            <div className="border-b border-border py-10 text-center">
              <p className="text-sm font-semibold text-foreground">
                아직 저장된 지원서가 없습니다.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                첫 지원서를 만들면 이곳이 이어쓰기 대장이 됩니다.
              </p>
            </div>
          ) : (
            <ul>
              {apps.map((app) => (
                <li key={app.id} className="border-b border-border">
                  <Link
                    href={`/resume/write?id=${app.id}`}
                    className="group flex items-center gap-4 px-1 py-4 transition-colors hover:bg-primary/[0.03]"
                  >
                    <StatusMark status={app.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {app.companyName || "회사명 없음"}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {app.jobTitle || "직무 없음"}
                        </span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:block">
                      문항 {app._count?.questions ?? 0} · {formatYMD(app.updatedAt)}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      이어쓰기
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
