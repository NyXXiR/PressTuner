"use client";

import clsx from "clsx";

type ChipButtonProps = {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
};

function ChipButton({ active, children, onClick }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "h-9 border px-3 text-[12px] transition-colors whitespace-nowrap",
        "focus:outline-none focus:ring-2 focus:ring-primary/30",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground hover:bg-muted border-border"
      )}
    >
      {children}
    </button>
  );
}

export type ArticlesFiltersProps = {
  search: string;
  onSearchChange: (v: string) => void;
  pageSize: number;
  onPageSizeChange: (v: number) => void;
  onReset: () => void;
  filtersOpen: boolean;
  toggleFilters: () => void;

  typeOptions?: Array<{ value: string; label: string }>;
  activeTypes?: string[];
  onToggleType?: (value: string) => void;
};

export function ArticlesFilters({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onReset,
  filtersOpen,
  toggleFilters,
  typeOptions = [],
  activeTypes = [],
  onToggleType,
}: ArticlesFiltersProps) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="flex flex-col gap-3">
        {/* row 1 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <input
                placeholder="제목 검색"
                className={clsx(
                  "h-9 w-full border border-input bg-background px-3",
                  "text-sm outline-none",
                  "focus:ring-2 focus:ring-primary/30"
                )}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={toggleFilters}
              className={clsx(
                "h-10 border border-border bg-background px-3 text-sm",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30"
              )}
            >
              {filtersOpen ? "필터 닫기" : "필터"}
            </button>

            <select
              className={clsx(
                "h-9 border border-input bg-background px-3 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-primary/30"
              )}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}개씩
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onReset}
              className={clsx(
                "h-9 border border-border bg-background px-3 text-sm",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30"
              )}
            >
              초기화
            </button>
          </div>
        </div>

        {/* row 2: filters */}
        {filtersOpen && typeOptions.length > 0 && onToggleType && (
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-muted-foreground">유형</span>
              <div className="overflow-x-auto">
                <div className="flex gap-2 w-max pr-1">
                  {typeOptions.map((t) => (
                    <ChipButton
                      key={t.value}
                      active={activeTypes.includes(t.value)}
                      onClick={() => onToggleType(t.value)}
                    >
                      {t.label}
                    </ChipButton>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
