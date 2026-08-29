// components/articles/ArticlesListView.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { RefObject } from "react";

import { ArticleItem } from "@/stores/articlesListStore";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/constants/articleConstants";
import {
  formatYMDHMFromISO,
  formatYMDHM,
  parseDate,
} from "@/lib/utils/datetime";

type MyStatus = ArticleItem["status"];
type MyType = ArticleItem["type"];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatUpdatedAt(input: unknown): string {
  if (input == null) return "—";
  if (typeof input === "string") return formatYMDHMFromISO(input);
  const d = parseDate(input as any);
  return d ? formatYMDHM(d) : "—";
}

function StatusPill({ status }: { status: MyStatus }) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight transition-colors";

  const map: Record<MyStatus, string> = {
    // DRAFT: 무채색 (테마 변수 활용)
    // - Light/Dark 모두 시스템 설정(--muted, --border)을 따름
    DRAFT: "border-border bg-muted/50 text-muted-foreground",

    // IN_PROGRESS (Blue)
    IN_PROGRESS:
      "border-blue-200 bg-blue-50 text-blue-700 " +
      "dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400",

    // FINAL (Emerald)
    FINAL:
      "border-emerald-200 bg-emerald-50 text-emerald-700 " +
      "dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
  };

  return <span className={cx(base, map[status])}>{STATUS_LABEL[status]}</span>;
}

function TeamPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground">
      {name}
    </span>
  );
}

export type ArticlesListViewProps = {
  items: ArticleItem[];
  loading: boolean;
  selectedIds: string[];
  idsOnPage: string[];
  checkedCountOnPage: number;
  allCheckedOnPage: boolean;
  someCheckedOnPage: boolean;
  headerCheckboxRef: RefObject<HTMLInputElement | null>;

  totalPages: number;
  page: number;
  onPageChange: (page: number) => void;

  onToggleOne: (id: string) => void;
  onSetAllOnPage: (idsOnPage: string[], checked: boolean) => void;
  onDeleteOne: (id: string) => void;
  onUpdateTeam: (id: string, teamId: string | null) => void;

  teamOptions: Array<{ id: string; name: string }>;
  getTeamLabel: (teamId: string | null) => string;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyCtaHref?: string;
  emptyCtaLabel?: string;
};

export function ArticlesListView({
  items,
  loading,
  selectedIds,
  idsOnPage,
  allCheckedOnPage,
  someCheckedOnPage,
  headerCheckboxRef,

  totalPages,
  page,
  onPageChange,

  onToggleOne,
  onSetAllOnPage,
  onDeleteOne,
  onUpdateTeam,

  teamOptions,
  getTeamLabel,

  emptyTitle = "결과가 없습니다",
  emptyDescription = "검색어/필터를 조정해보세요.",
  emptyCtaHref = "/press/new",
  emptyCtaLabel = "새 보도자료 생성",
}: ArticlesListViewProps) {
  const checkedSet = new Set(selectedIds);

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someCheckedOnPage && !allCheckedOnPage;
  }, [someCheckedOnPage, allCheckedOnPage, headerCheckboxRef]);
  return (
    <>
      <div className="flex-1 min-h-0 border border-border bg-card overflow-hidden flex flex-col">
        <div className="hidden sm:block border-b border-border bg-card/60 px-3 py-2">
          <div className="grid grid-cols-[1.6fr_1fr_0.8fr_0.7fr_1fr] items-center text-[12px] text-muted-foreground gap-3">
            <div className="flex items-center gap-3">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={allCheckedOnPage}
                onChange={(e) => onSetAllOnPage(idsOnPage, e.target.checked)}
                className="h-4 w-4"
                aria-label="현재 페이지 전체 선택"
              />
              <span>제목</span>
            </div>
            <div>팀</div>
            <div>상태</div>
            <div>유형</div>
            <div className="text-right">업데이트</div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="p-4 text-[12px] text-muted-foreground">
              불러오는 중…
            </div>
          ) : items.length === 0 ? (
            <div className="p-6">
              <div className="border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">{emptyTitle}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {emptyDescription}
                </p>
                {emptyCtaHref && (
                  <div className="mt-3">
                    <Link
                      href={emptyCtaHref}
                      className={cx(
                        "inline-flex items-center gap-2 border border-border px-3 py-2",
                        "text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {emptyCtaLabel}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 모바일 */}
              <ul className="sm:hidden divide-y divide-border">
                {items.map((it) => {
                  const checked = checkedSet.has(it.id);
                  const status = it.status as MyStatus;
                  const type = it.type as MyType;

                  return (
                    <li key={it.id} className="p-3 hover:bg-muted/30">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleOne(it.id)}
                          className="mt-1 h-4 w-4"
                          aria-label={`${it.title ?? "제목 없음"} 선택`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/press/articles/${it.id}`}
                              className="min-w-0 flex-1 truncate font-medium hover:underline"
                            >
                              {it.title || "(제목 없음)"}
                            </Link>
                            <StatusPill status={status} />
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                            <TeamPill name={getTeamLabel(it.teamId)} />
                            <span className="opacity-40">·</span>
                            <span className="rounded-full border border-border px-2 py-0.5">
                              {TYPE_LABEL[type]}
                            </span>
                            <span className="opacity-40">·</span>
                            <span>
                              {formatUpdatedAt((it as any).updatedAt)}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <select
                              value={it.teamId ?? ""}
                              onChange={(e) =>
                                onUpdateTeam(it.id, e.target.value || null)
                              }
                              className="h-8 border border-input bg-background px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">미지정</option>
                              {teamOptions.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>

                            <Link
                              href={`/press/${it.id}/edit`}
                              className="border border-border px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              수정
                            </Link>

                            <button
                              type="button"
                              onClick={() =>
                                confirm("삭제할까요?") && onDeleteOne(it.id)
                              }
                              className="border border-border px-2 py-1 text-[12px] text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* 데스크탑 */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <tbody className="divide-y divide-border">
                    {items.map((it) => {
                      const checked = checkedSet.has(it.id);
                      const status = it.status as MyStatus;
                      const type = it.type as MyType;

                      return (
                        <tr key={it.id} className="hover:bg-muted/30">
                          <td className="w-[44%] px-3 py-3 align-top">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggleOne(it.id)}
                                className="mt-1 h-4 w-4"
                                aria-label={`${it.title ?? "제목 없음"} 선택`}
                              />
                              <div className="min-w-0">
                                <Link
                                  href={`/press/articles/${it.id}`}
                                  className="block truncate font-medium hover:underline"
                                >
                                  {it.title || "(제목 없음)"}
                                </Link>

                                <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                                  <Link
                                    href={`/press/${it.id}/edit`}
                                    className="hover:text-foreground"
                                  >
                                    수정
                                  </Link>
                                  <span className="opacity-40">·</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      confirm("삭제할까요?") &&
                                      onDeleteOne(it.id)
                                    }
                                    className="hover:text-red-200"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="w-[18%] px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <TeamPill name={getTeamLabel(it.teamId)} />
                              <select
                                value={it.teamId ?? ""}
                                onChange={(e) =>
                                  onUpdateTeam(it.id, e.target.value || null)
                                }
                                className="h-8 border border-input bg-background px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <option value="">미지정</option>
                                {teamOptions.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>

                          <td className="w-[14%] px-3 py-3">
                            <StatusPill status={status} />
                          </td>

                          <td className="w-[10%] px-3 py-3 text-[12px] text-muted-foreground">
                            {TYPE_LABEL[type]}
                          </td>

                          <td className="w-[14%] px-3 py-3 text-right text-[12px] text-muted-foreground">
                            {formatUpdatedAt((it as any).updatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12px] text-muted-foreground">
          페이지 <span className="text-foreground font-medium">{page}</span> /{" "}
          <span className="text-foreground font-medium">{totalPages}</span>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            className={cx(
              "h-9 px-3 border border-border text-[12px]",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "disabled:opacity-50 disabled:hover:bg-transparent",
              "focus:outline-none focus:ring-2 focus:ring-primary/30"
            )}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
          >
            이전
          </button>

          <button
            type="button"
            className={cx(
              "h-9 px-3 border border-border text-[12px]",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "disabled:opacity-50 disabled:hover:bg-transparent",
              "focus:outline-none focus:ring-2 focus:ring-primary/30"
            )}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
          >
            다음
          </button>
        </div>
      </div>
    </>
  );
}
