import type { ItemContent, TagGroup, TagsContent } from "./model";

const detailTypeLabels = {
  project: "프로젝트",
  responsibility: "상시 책임",
  improvement: "개선",
  troubleshooting: "문제 해결",
} as const;

export function careerDetailLabel(item: ItemContent) {
  return item.detailLabel?.trim() || detailTypeLabels[item.detailType ?? "project"];
}

export function careerDetailSubtitle(item: ItemContent, grouped = false) {
  const employer = item.relatedWorkTitle?.trim() ?? "";
  let subtitle = item.subtitle.trim();
  if (grouped && employer) {
    if (subtitle === employer) subtitle = "";
    else if (subtitle.startsWith(`${employer} · `)) subtitle = subtitle.slice(employer.length + 3).trim();
  }
  if (grouped) return subtitle;
  return [...new Set([employer, subtitle].filter(Boolean))].join(" · ");
}

export function normalizeTagGroups(content: TagsContent): TagGroup[] {
  if (content.groups?.length) return content.groups.map((group) => ({ ...group, items: [...group.items] }));
  return [{ id: "keywords", title: "기타", items: [...content.items] }];
}

export function serializeTagGroups(groups: TagGroup[]): TagsContent {
  const normalized = groups.map((group) => ({ ...group, title: group.title.trim(), items: [...group.items] }));
  return { items: normalized.flatMap((group) => group.items), groups: normalized };
}
