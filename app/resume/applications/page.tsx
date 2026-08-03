"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Loader2,
  PenLine,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

import {
  useResumeApplicationListStore,
  type ResumeApplicationItem,
  type ResumeApplicationStatus,
} from "@/stores/useResumeApplicationListStore";

function formatYMD(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "날짜 없음";
  return date.toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function isActiveFilter(
  status: ResumeApplicationStatus[],
  value: ResumeApplicationStatus | "ALL",
) {
  if (value === "ALL") return status.length === 0;
  return status.length === 1 && status[0] === value;
}

const STATUS_FILTERS = [
  { label: "전체", value: "ALL" },
  { label: "작성 중", value: "WRITING" },
  { label: "완료", value: "DONE" },
] as const;

const TUTORIAL_SEEN_KEY = "presstuner.resume-write-tutorial-seen:v1";

function StatusMark({ status }: { readonly status: ResumeApplicationItem["status"] }) {
  if (status === "DONE") {
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
  return <PenLine className="h-5 w-5 shrink-0 text-primary" aria-label="작성 중" />;
}

export default function ResumeApplicationsPage() {
  const {
    query,
    list,
    setFilters,
    setPage,
    fetchList,
    deleteOne,
  } = useResumeApplicationListStore();
  const [qDraft, setQDraft] = useState(query.q ?? "");
  const [primaryHref] = useState(() => {
    if (typeof window === "undefined") return "/resume/write";
    const seen = window.sessionStorage.getItem(TUTORIAL_SEEN_KEY);
    return seen ? "/resume/write" : "/resume/write?tutorial=1";
  });
  const qDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current);
    qDebounceRef.current = window.setTimeout(() => {
      if ((query.q ?? "") !== qDraft) {
        setFilters({ q: qDraft });
      }
    }, 300);

    return () => {
      if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current);
    };
  }, [qDraft, query.q, setFilters]);

  useEffect(() => {
    void fetchList();
  }, [query.page, query.pageSize, query.q, query.status, fetchList]);

  const totalPages = useMemo(
    () => Math.max(1, list.totalPages || 1),
    [list.totalPages],
  );

  const resetFilters = () => {
    setQDraft("");
    setFilters({ q: "", status: ["WRITING"] });
  };

  const applyStatusFilter = (value: ResumeApplicationStatus | "ALL") => {
    setFilters({ status: value === "ALL" ? [] : [value] });
  };

  const handleDelete = (item: ResumeApplicationItem) => {
    const label = item.companyName || item.jobTitle || "이 지원서";
    if (!window.confirm(`${label} 지원서를 삭제할까요?`)) return;
    void deleteOne(item.id);
  };

  const filtersDirty =
    Boolean(query.q) || query.status.length !== 1 || query.status[0] !== "WRITING";

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-primary">
            지원서 대장
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            지원서 목록
            {list.total > 0 && (
              <span className="ml-3 font-mono text-lg font-bold tabular-nums text-muted-foreground">
                {list.total}건
              </span>
            )}
          </h1>
        </div>
        <Link
          href={primaryHref}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          새 지원서 작성
        </Link>
      </header>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            aria-label="지원서 검색"
            placeholder="기업명 또는 직무 검색"
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
                onClick={() => applyStatusFilter(filter.value)}
                aria-pressed={isActiveFilter(query.status, filter.value)}
                className={[
                  "h-11 border px-4 text-sm font-bold transition-colors",
                  index > 0 ? "-ml-px" : "",
                  isActiveFilter(query.status, filter.value)
                    ? "z-10 border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {filtersDirty && (
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
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : list.error ? (
          <p className="border-b border-border py-6 text-center text-sm font-semibold text-destructive">
            {list.error}
          </p>
        ) : list.items.length === 0 ? (
          <div className="border-b border-border py-14 text-center">
            <h2 className="text-lg font-bold text-foreground">
              조건에 맞는 지원서가 없습니다.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              검색어를 줄이거나 새 지원서를 만들어보세요.
            </p>
          </div>
        ) : (
          <ul>
            {list.items.map((item) => (
              <li key={item.id} className="border-b border-border">
                <div className="group flex flex-col gap-3 px-1 py-4 transition-colors hover:bg-primary/[0.03] sm:flex-row sm:items-center sm:gap-4">
                  <StatusMark status={item.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {item.companyName || "회사명 없음"}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {item.jobTitle || "직무 없음"}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground sm:hidden">
                      문항 {item._count?.questions ?? 0} · {formatYMD(item.updatedAt)}
                    </p>
                  </div>
                  <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:block">
                    문항 {item._count?.questions ?? 0} · {formatYMD(item.updatedAt)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link
                      href={`/resume/write?id=${item.id}`}
                      className="inline-flex h-9 items-center gap-1.5 border border-primary/40 bg-card px-3.5 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      이어쓰기
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <Link
                      href={`/resume/applications/${item.id}`}
                      className="inline-flex h-9 items-center border border-border bg-card px-3.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      상세
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`${item.companyName || "지원서"} 삭제`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {list.total > 0 && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={query.page === 1}
            onClick={() => setPage(query.page - 1)}
            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
            {query.page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={query.page >= totalPages}
            onClick={() => setPage(query.page + 1)}
            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
