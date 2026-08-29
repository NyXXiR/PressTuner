"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  Suspense,
} from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeamPressStore } from "@/stores/teamPressStore";
import { STATUS_LABEL, STATUS_OPTIONS } from "@/lib/constants/articleConstants";
import { formatYMDHMFromISO } from "@/lib/utils/datetime";
import {
  Plus,
  Search,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  User,
  Calendar,
} from "lucide-react";
import { StatusBadge, type BadgeVariant } from "@/components/ui/status-badge";

type MyStatus = keyof typeof STATUS_LABEL;

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// --- UI Components ---

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-8 border px-4 text-[12px] font-medium transition-all whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground hover:bg-muted border-border",
      )}
    >
      {children}
    </button>
  );
}

// Badge Helper
const ARTICLE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: "neutral",
  BRIEF: "indigo",
  IN_PROGRESS: "blue",
  FINAL: "emerald",
  DECLINED: "rose",
};

// --- Main Content ---

function TeamArticlesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    query,
    list,
    selectedIds,
    setFilters,
    setPage,
    setPageSize,
    fetchList,
    deleteOne,
    toggleOne,
    setAllOnPage,
    clearSelection,
    bulkDeleteSelected,
  } = useTeamPressStore();

  const [qDraft, setQDraft] = useState(query.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Store와 로컬 state 동기화
  const [prevQueryQ, setPrevQueryQ] = useState(query.q);
  if (query.q !== prevQueryQ) {
    setPrevQueryQ(query.q);
    setQDraft(query.q ?? "");
  }

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      const urlStatus = searchParams.get("status");
      const urlPeriod = searchParams.get("period");
      const urlQ = searchParams.get("q");

      if (urlStatus || urlPeriod || urlQ) {
        setFilters({
          status: urlStatus ? [urlStatus as any] : [],
          period: urlPeriod || null,
          q: urlQ || "",
        });
      }
      initialized.current = true;
    }
  }, [searchParams, setFilters]);

  // debounce search
  const qDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current);
    qDebounceRef.current = window.setTimeout(() => {
      if ((query.q ?? "") !== qDraft) {
        clearSelection();
        setFilters({ q: qDraft });
        setPage(1);
      }
    }, 350);
    return () => {
      if (qDebounceRef.current) window.clearTimeout(qDebounceRef.current);
    };
  }, [qDraft, query.q, setFilters, setPage, clearSelection]);

  useEffect(() => {
    fetchList();
  }, [
    query.page,
    query.pageSize,
    query.q,
    query.status,
    query.period,
    fetchList,
  ]);

  const idsOnPage = list.items.map((x) => x.id);
  const checkedCountOnPage = useMemo(() => {
    const set = new Set(selectedIds);
    return idsOnPage.filter((id) => set.has(id)).length;
  }, [idsOnPage, selectedIds]);

  const allCheckedOnPage =
    idsOnPage.length > 0 && checkedCountOnPage === idsOnPage.length;
  const someCheckedOnPage = checkedCountOnPage > 0 && !allCheckedOnPage;
  const headerCbRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCbRef.current)
      headerCbRef.current.indeterminate = someCheckedOnPage;
  }, [someCheckedOnPage]);

  const totalPages = Math.max(1, list.totalPages || 1);

  const toggleFilter = (value: MyStatus) => {
    clearSelection();
    const cur = new Set(query.status);
    cur.has(value) ? cur.delete(value) : cur.add(value);
    setFilters({ status: Array.from(cur) as any });
    setPage(1);
  };

  const resetFilters = () => {
    clearSelection();
    setQDraft("");
    setFilters({ q: "", status: [], period: null });
    setPage(1);
    router.replace("/team/articles");
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl font-display">
            팀 보도자료
          </h1>
          <p className="text-sm text-muted-foreground">
            워크스페이스 구성원들과 공유하는 모든 보도자료를 관리합니다.
          </p>
        </div>
        <Link
          href="/press/new"
          className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
        >
          <Plus size={16} />새 보도자료 생성
        </Link>
      </header>

      {/* Search & Filter Surface */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 md:max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <input
              placeholder="팀 문서 제목 검색..."
              className="h-10 w-full border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
            />
          </div>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cx(
              "inline-flex h-10 w-10 items-center justify-center border transition-all",
              filtersOpen
                ? "bg-primary/10 border-primary text-primary"
                : "bg-card border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <Filter size={16} />
          </button>
          {(query.q || query.status.length > 0 || query.period) && (
            <button
              onClick={resetFilters}
              className="inline-flex h-10 w-10 items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted transition-all"
              title="필터 초기화"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>

        {query.period === "current_month" && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary text-xs font-bold border border-primary/20 animate-in fade-in">
            <Calendar size={14} />
            이번 달 목록
            <button
              onClick={() => setFilters({ period: null })}
              className="ml-1 hover:text-foreground opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {query.period !== "current_month" && (
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/30 px-3 py-2 border border-border">
            Shared Workspace
          </div>
        )}
      </div>

      {filtersOpen && (
        <div className="p-5 bg-card border border-border animate-in fade-in slide-in-from-top-2">
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 block">
                상태 필터
              </span>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <ChipButton
                    key={value}
                    active={query.status.includes(value)}
                    onClick={() => toggleFilter(value as MyStatus)}
                  >
                    {label}
                  </ChipButton>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              * 팀 보도자료 화면은{" "}
              <b className="text-foreground">보도자료(PRESS_RELEASE)</b> 유형만
              표시됩니다.
            </p>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 animate-in zoom-in-95">
          <span className="text-sm font-medium text-primary">
            <b className="mr-1">{selectedIds.length}</b>개의 팀 문서 선택됨
          </span>
          <div className="flex gap-2">
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              선택 해제
            </button>
            <button
              onClick={() =>
                confirm(`${selectedIds.length}개를 삭제할까요?`) &&
                bulkDeleteSelected()
              }
              className="px-4 py-1.5 text-xs font-bold bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
            >
              선택 삭제
            </button>
          </div>
        </div>
      )}

      <div className="border border-border bg-card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-4 w-12 text-center">
                <input
                  ref={headerCbRef}
                  type="checkbox"
                  checked={allCheckedOnPage}
                  onChange={(e) => setAllOnPage(idsOnPage, e.target.checked)}
                  className="rounded border-border text-primary"
                />
              </th>
              <th className="px-3 py-4">보도자료 제목</th>
              <th className="px-3 py-4">상태</th>
              <th className="px-3 py-4 hidden md:table-cell">작성자</th>
              <th className="px-3 py-4 hidden lg:table-cell text-right">
                최근 업데이트
              </th>
              <th className="px-5 py-4 w-28 text-right">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-10 text-center text-sm text-muted-foreground"
                >
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : list.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {query.period
                        ? "해당 기간에 생성된 자료가 없습니다."
                        : "공유된 보도자료가 없습니다."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              list.items.map((it) => (
                <tr
                  key={it.id}
                  className="group hover:bg-muted/20 transition-colors"
                >
                  <td className="px-5 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(it.id)}
                      onChange={() => toggleOne(it.id)}
                      className="rounded border-border text-primary"
                    />
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-col min-w-0 max-w-[350px]">
                      <Link
                        href={`/press/articles/${it.id}`}
                        className="text-sm font-semibold hover:underline decoration-primary/50 underline-offset-4 truncate"
                      >
                        {it.title || "(제목 없음)"}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 md:hidden">
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <User size={10} /> {it.user?.label ?? "-"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <StatusBadge
                      variant={ARTICLE_STATUS_VARIANT[it.status] || "neutral"}
                    >
                      {STATUS_LABEL[it.status as MyStatus]}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-2 text-[12px] font-medium text-foreground/80">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground border border-border">
                        {it.user?.label?.charAt(0) ?? "?"}
                      </div>
                      {it.user?.label ?? "-"}
                    </div>
                  </td>
                  <td className="px-3 py-4 hidden lg:table-cell text-right text-[12px] text-muted-foreground font-medium">
                    {formatYMDHMFromISO(it.updatedAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/team/articles/${it.id}/edit`}
                        className="inline-flex items-center justify-center p-2 text-muted-foreground hover:bg-muted hover:text-primary transition-all"
                        title="편집하기"
                      >
                        <Edit3 size={14} />
                      </Link>
                      <button
                        onClick={() =>
                          confirm("정말 삭제할까요?") && deleteOne(it.id)
                        }
                        className="inline-flex items-center justify-center p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-all"
                        title="삭제하기"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">
            페이지{" "}
            <span className="font-bold text-foreground">{query.page}</span> /{" "}
            {totalPages}
          </p>
          <select
            className="h-8 border border-border bg-card px-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
            value={query.pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
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
            onClick={() => setPage(query.page - 1)}
            disabled={query.page <= 1 || list.loading}
            className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage(query.page + 1)}
            disabled={query.page >= totalPages || list.loading}
            className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function TeamArticlesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <p className="text-sm text-muted-foreground animate-pulse">
            팀 문서를 불러오는 중...
          </p>
        </div>
      }
    >
      <TeamArticlesContent />
    </Suspense>
  );
}
