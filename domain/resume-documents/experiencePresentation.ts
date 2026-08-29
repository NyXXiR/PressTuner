import { resolveCareerDetailRelation, type ItemContent } from "./model";

export type ExperienceSortDirection = "latest-first" | "oldest-first";
export type CareerDurationLabel = "auto" | "total" | "relevant";
export type ResolvedCareerDurationLabel = Exclude<CareerDurationLabel, "auto">;

const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parseYearMonth(value?: string): number | null {
  const match = value?.match(YEAR_MONTH_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function sortExperienceItems(
  items: readonly ItemContent[],
  direction?: ExperienceSortDirection,
): ItemContent[] {
  if (direction !== "latest-first" && direction !== "oldest-first") return [...items];
  return items
    .map((item, index) => ({ item, index, month: parseYearMonth(item.startMonth) }))
    .sort((left, right) => {
      if (left.month === null && right.month === null) return left.index - right.index;
      if (left.month === null) return 1;
      if (right.month === null) return -1;
      const difference = direction === "latest-first"
        ? right.month - left.month
        : left.month - right.month;
      return difference || left.index - right.index;
    })
    .map(({ item }) => item);
}

type MonthInterval = { start: number; end: number };

export function normalizeExperienceIntervals(
  items: readonly ItemContent[],
  currentMonth: string,
): MonthInterval[] {
  const current = parseYearMonth(currentMonth);
  if (current === null) return [];
  return items.flatMap((item) => {
    if (item.excludeFromCareerDuration) return [];
    if (item.itemKind && item.itemKind !== "work") return [];
    const start = parseYearMonth(item.startMonth);
    const hasEndMonth = item.endMonthEnabled ?? Boolean(item.endMonth);
    const end = item.isCurrent
      ? current
      : hasEndMonth ? parseYearMonth(item.endMonth) : null;
    if (start === null || end === null || start > end) return [];
    return [{ start, end }];
  });
}

export function mergeExperienceIntervals(intervals: readonly MonthInterval[]): MonthInterval[] {
  const sorted = intervals
    .map((interval) => ({ ...interval }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: MonthInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end + 1) {
      merged.push(interval);
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function calculateAutomaticCareerDurationMonths(
  items: readonly ItemContent[],
  currentMonth: string,
): number {
  return mergeExperienceIntervals(normalizeExperienceIntervals(items, currentMonth))
    .reduce((total, interval) => total + interval.end - interval.start + 1, 0);
}

export function normalizeCareerDurationOverride(years: number, months: number): number {
  const normalizedYears = Number.isFinite(years) ? Math.max(0, Math.trunc(years)) : 0;
  const normalizedMonths = Number.isFinite(months)
    ? Math.min(11, Math.max(0, Math.trunc(months)))
    : 0;
  return normalizedYears * 12 + normalizedMonths;
}

export function resolveCareerDurationMonths(
  items: readonly ItemContent[],
  overrideMonths: number | undefined,
  currentMonth: string,
): number {
  if (Number.isFinite(overrideMonths) && overrideMonths !== undefined && overrideMonths >= 0) {
    return Math.trunc(overrideMonths);
  }
  return calculateAutomaticCareerDurationMonths(items, currentMonth);
}

export function resolveCareerDurationLabel(
  items: readonly ItemContent[],
  label: CareerDurationLabel | undefined,
): ResolvedCareerDurationLabel {
  if (label === "total" || label === "relevant") return label;
  return items.some((item) => (!item.itemKind || item.itemKind === "work") && item.excludeFromCareerDuration)
    ? "relevant"
    : "total";
}

export function formatCareerDuration(
  totalMonths: number,
  label: ResolvedCareerDurationLabel = "total",
): string {
  const normalized = Number.isFinite(totalMonths) ? Math.max(0, Math.trunc(totalMonths)) : 0;
  const years = Math.floor(normalized / 12);
  const months = normalized % 12;
  const parts = [years > 0 ? `${years}년` : "", months > 0 || years === 0 ? `${months}개월` : ""]
    .filter(Boolean)
    .join(" ");
  return `${label === "relevant" ? "관련 경력" : "총 경력"} ${parts}`;
}

export type CareerDetailGroup = {
  work: ItemContent;
  details: ItemContent[];
};

export function groupCareerDetails(
  workItems: readonly ItemContent[],
  detailItems: readonly ItemContent[],
  options: {
    workSortDirection?: ExperienceSortDirection;
    detailSortDirection?: ExperienceSortDirection;
    matchFallbackTitles?: boolean;
  } = {},
) {
  const sortedWorks = sortExperienceItems(
    workItems.filter((item) => !item.itemKind || item.itemKind === "work"),
    options.workSortDirection,
  );
  const sortedDetails = sortExperienceItems(
    detailItems.map((item) => item.itemKind === "career-detail" ? item : { ...item, itemKind: "career-detail" as const }),
    options.detailSortDirection,
  );
  const detailsByWorkId = new Map(sortedWorks.map((work) => [work.id, [] as ItemContent[]]));
  const independentDetails: ItemContent[] = [];
  const unresolvedDetails: ItemContent[] = [];
  for (const detail of sortedDetails) {
    const relation = resolveCareerDetailRelation(detail, sortedWorks, { matchFallbackTitles: options.matchFallbackTitles });
    if (relation.status === "linked") detailsByWorkId.get(relation.work.id)?.push(detail);
    else if (relation.status === "independent") independentDetails.push(detail);
    else unresolvedDetails.push(detail);
  }
  return {
    employmentGroups: sortedWorks.map((work) => ({ work, details: detailsByWorkId.get(work.id) ?? [] })),
    independentDetails,
    unresolvedDetails,
  };
}
