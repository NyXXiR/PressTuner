import type { ItemContent, ResumeItemKind } from "./model";

export type ResumeItemDatePolicy = {
  dateMode: "none" | "single" | "range";
  startMeaning: "started" | "acquired" | "awarded" | "tested";
  endBehavior: "hidden" | "optional" | "always";
  endMeaning?: "ended" | "graduated" | "expires";
  ongoingMeaning?: "employed" | "in-progress" | "enrolled";
};

const itemKindBySectionId: Record<string, ResumeItemKind> = {
  experience: "work",
  projects: "career-detail",
  education: "education",
  credentials: "credential",
};

export function resolveResumeItemKind(
  item: Pick<ItemContent, "itemKind">,
  sectionId?: string,
): ResumeItemKind | undefined {
  if (item.itemKind === "project" || item.itemKind === "career-description") return "career-detail";
  return item.itemKind ?? (sectionId ? itemKindBySectionId[sectionId] : undefined);
}

export function resolveResumeItemDatePolicy(
  item: Pick<ItemContent, "itemKind" | "detailType">,
  sectionId?: string,
): ResumeItemDatePolicy {
  const kind = resolveResumeItemKind(item, sectionId);
  if (kind === "work") return { dateMode: "range", startMeaning: "started", endBehavior: "always", ongoingMeaning: "employed" };
  if (kind === "career-detail") return { dateMode: "range", startMeaning: "started", endBehavior: "always", ongoingMeaning: "in-progress" };
  if (kind === "education") return { dateMode: "range", startMeaning: "started", endBehavior: "always", endMeaning: "graduated", ongoingMeaning: "enrolled" };
  if (kind === "credential") return { dateMode: "single", startMeaning: "acquired", endBehavior: "optional", endMeaning: "expires" };
  if (kind === "language") return { dateMode: "single", startMeaning: "tested", endBehavior: "optional", endMeaning: "expires" };
  if (kind === "award") return { dateMode: "single", startMeaning: "awarded", endBehavior: "hidden" };
  if (kind === "activity" || kind === "training") return { dateMode: "range", startMeaning: "started", endBehavior: "optional", endMeaning: "ended" };
  return { dateMode: "single", startMeaning: "started", endBehavior: "optional", endMeaning: "ended" };
}

export function normalizeResumeItemDateValues<T extends Pick<ItemContent, "itemKind" | "detailType" | "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">>(item: T, sectionId?: string): T & Pick<ItemContent, "endMonth" | "endMonthEnabled" | "isCurrent"> {
  const policy = resolveResumeItemDatePolicy(item, sectionId);
  if (policy.dateMode === "none" || policy.endBehavior === "hidden") {
    return { ...item, endMonth: "", endMonthEnabled: false, isCurrent: false };
  }
  if (policy.ongoingMeaning && item.isCurrent) {
    return { ...item, endMonth: "", endMonthEnabled: false, isCurrent: true };
  }
  const endEnabled = item.endMonthEnabled ?? Boolean(item.endMonth);
  if (policy.endBehavior === "optional" && !endEnabled) {
    return { ...item, endMonth: "", endMonthEnabled: false, isCurrent: false };
  }
  return {
    ...item,
    endMonthEnabled: policy.endBehavior === "always" ? true : endEnabled,
    isCurrent: false,
  };
}

export function normalizeResumeItemDates(item: ItemContent, sectionId?: string): ItemContent {
  return normalizeResumeItemDateValues(item, sectionId);
}

export function findResumeItemDateIssue(
  item: Pick<ItemContent, "itemKind" | "detailType" | "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">,
  sectionId?: string,
): { field: "endMonth"; message: string } | null {
  const policy = resolveResumeItemDatePolicy(item, sectionId);
  const endIsActive = policy.endBehavior === "always" || (policy.endBehavior === "optional" && (item.endMonthEnabled ?? Boolean(item.endMonth)));
  if (endIsActive && !item.isCurrent && item.startMonth && item.endMonth && item.startMonth > item.endMonth) {
    return { field: "endMonth", message: "종료 연월은 시작 연월보다 빠를 수 없습니다." };
  }
  return null;
}
