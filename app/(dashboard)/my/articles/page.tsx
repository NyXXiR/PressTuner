"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

import { StatusBadge, type BadgeVariant } from "@/components/ui/status-badge";
import { STATUS_LABEL } from "@/lib/constants/articleConstants";
import { formatYMDHMFromISO } from "@/lib/utils/datetime";
import { useMyArticlesStore } from "@/stores/myArticlesStore";
import { PageHeader } from "@/components/page/PageHeader";
import { PageCTA, PageCTAGroup } from "@/components/page/PageCTA";

type MyStatus = keyof typeof STATUS_LABEL;
type StatusTab = "all" | "drafts" | "active" | "final";

const ARTICLE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: "neutral",
  BRIEF: "indigo",
  IN_PROGRESS: "blue",
  FINAL: "emerald",
};

const STATUS_FILTERS = [
  { label: "전체", value: "all" },
  { label: "초안", value: "drafts" },
  { label: "작성 중", value: "active" },
  { label: "완료", value: "final" },
] as const;

function isActiveTab(status: string[], tab: StatusTab) {
  if (tab === "all") return status.length === 0;
  if (tab === "drafts") return status.length === 1 && status[0] === "DRAFT";
  if (tab === "active") return status.length === 1 && status[0] === "IN_PROGRESS";
  return status.length === 1 && status[0] === "FINAL";
}

function actionForStatus(id: string, status: string) {
  if (status === "FINAL") {
    return { href: `/press/${id}/final`, label: "열기" };
  }
  return { href: `/press/${id}/edit`, label: "이어쓰기" };
}

function MyArticlesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    query,
    list,
    setFilters,
    setPage,
    setPageSize,
    fetchList,
    deleteOne,
  } = useMyArticlesStore();

  const [qDraft, setQDraft] = useState(query.q ?? "");
  const [prevQueryQ, setPrevQueryQ] = useState(query.q);

  if (query.q !== prevQueryQ) {
    setPrevQueryQ(query.q);
    setQDraft(query.q ?? "");
  }

  const initialized = useRef(false);
  const qDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialized.current) return;

    const urlStatus = searchParams.get("status");
    const urlPeriod = searchParams.get("period");
    const urlQ = searchParams.get("q");
    const initialStatus = urlStatus ? urlStatus.split(",") : [];

    setFilters({
      status: initialStatus,
      period: urlPeriod || null,
      q: urlQ || "",
      type: [],
    });
    initialized.current = true;
  }, [searchParams, setFilters]);

  useEffect(() => {
    if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current);
    qDebounceRef.current = window.setTimeout(() => {
      if ((query.q ?? "") !== qDraft) {
        setFilters({ q: qDraft });
        setPage(1);
      }
    }, 350);

    return () => {
      if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current);
    };
  }, [qDraft, query.q, setFilters, setPage]);

  useEffect(() => {
    fetchList();
  }, [
    query.page,
    query.pageSize,
    query.q,
    query.status,
    query.type,
    query.period,
    fetchList,
  ]);

  const handleTabChange = (tab: StatusTab) => {
    const nextStatus =
      tab === "drafts"
        ? ["DRAFT"]
        : tab === "active"
          ? ["IN_PROGRESS"]
          : tab === "final"
            ? ["FINAL"]
            : [];

    setFilters({ status: nextStatus, period: null, type: [] });
    setPage(1);
    router.replace("/my/articles");
  };

  const resetFilters = () => {
    setFilters({ q: "", type: [], period: null, status: [] });
    setQDraft("");
    router.replace("/my/articles");
  };

  const totalPages = Math.max(1, list.totalPages || 1);
  const hasActiveFilters =
    Boolean(query.q) || query.period !== null || query.status.length > 0;

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          eyebrow="brieFFlow Press"
          title={
            list.total > 0
              ? `보도자료 목록 (${list.total}건)`
              : "보도자료 목록"
          }
          description="개인 작성 문서를 확인하고 이어서 작성합니다."
        />
        <PageCTAGroup>
          <PageCTA href="/press/new">
            <Plus className="h-4 w-4" />
            새 보도자료 작성
          </PageCTA>
        </PageCTAGroup>
      </header>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            aria-label="보도자료 검색"
            placeholder="보도자료 제목 검색"
            value={qDraft}
            onChange={(event) => setQDraft(event.target.value)}
            className="h-11 w-full border border-border bg-card pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex" role="group" aria-label="상태 필터">
            {STATUS_FILTERS.map((filter, index) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => handleTabChange(filter.value as StatusTab)}
                aria-pressed={isActiveTab(query.status, filter.value as StatusTab)}
                className={[
                  "h-11 border px-4 text-sm font-bold transition-colors",
                  index > 0 ? "-ml-px" : "",
                  isActiveTab(query.status, filter.value as StatusTab)
                    ? "z-10 border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {query.period === "current_month" && (
            <div className="inline-flex h-11 shrink-0 items-center gap-2 border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              이번 달 목록
              <button
                type="button"
                onClick={() => {
                  setFilters({ period: null });
                  router.replace("/my/articles");
                }}
                className="text-primary/60 hover:text-primary"
                aria-label="기간 필터 제거"
              >
                ✕
              </button>
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-11 w-11 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="필터 초기화"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 border-t-2 border-foreground">
        {list.loading ? (
          <div className="flex min-h-64 items-center justify-center border-b border-border">
            <p className="text-sm text-muted-foreground">데이터를 불러오는 중...</p>
          </div>
        ) : list.items.length === 0 ? (
          <div className="border-b border-border py-14 text-center">
            <h2 className="text-lg font-bold text-foreground">
              {query.period ? "해당 기간의 문서가 없습니다." : "검색 결과가 없습니다."}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              새 문서를 만들거나 검색어를 바꿔보세요.
            </p>
            <div className="mt-4">
              <PageCTA href="/press/new">새 보도자료 작성</PageCTA>
            </div>
          </div>
        ) : (
          <ul>
            {list.items.map((it) => {
              const primaryAction = actionForStatus(it.id, it.status);

              return (
                <li key={it.id} className="border-b border-border">
                  <div className="group flex flex-col gap-3 px-1 py-4 transition-colors hover:bg-primary/[0.03] sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={primaryAction.href}
                          className="min-w-0 truncate text-sm font-bold text-foreground transition-colors hover:text-primary"
                        >
                          {it.title || "(제목 없음)"}
                        </Link>
                        <StatusBadge
                          variant={ARTICLE_STATUS_VARIANT[it.status] || "neutral"}
                        >
                          {STATUS_LABEL[it.status as MyStatus] || it.status}
                        </StatusBadge>
                      </div>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        최종 업데이트 {formatYMDHMFromISO(it.updatedAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Link
                        href={primaryAction.href}
                        className="inline-flex h-9 items-center gap-1.5 border border-primary/40 bg-card px-3.5 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        {primaryAction.label}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                      <Link
                        href={`/press/${it.id}/edit`}
                        className="inline-flex h-9 items-center border border-border bg-card px-3.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="편집하기"
                        aria-label="편집하기"
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => confirm("정말 삭제할까요?") && deleteOne(it.id)}
                        className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="삭제하기"
                        aria-label="삭제하기"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {list.total > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              {query.page} / {totalPages}
            </span>
            <select
              className="h-9 border border-border bg-card px-2 text-xs font-bold outline-none focus:border-primary"
              value={query.pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              aria-label="페이지 크기"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}개씩 보기
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(query.page - 1)}
              disabled={query.page <= 1 || list.loading}
              className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage(query.page + 1)}
              disabled={query.page >= totalPages || list.loading}
              className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyArticlesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <p className="animate-pulse text-sm text-muted-foreground">
            페이지 정보를 불러오는 중...
          </p>
        </div>
      }
    >
      <MyArticlesContent />
    </Suspense>
  );
}
