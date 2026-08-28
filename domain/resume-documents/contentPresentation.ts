import type { ItemContent, TagGroup, TagKeyword, TagsContent } from "./model";

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

export type NormalizedTagGroup = TagGroup & { keywords: TagKeyword[] };

export function parseTagKeywordDraft(draft: string, existingLabels: string[] = []) {
  const seen = new Set(existingLabels.map((label) => label.trim().toLocaleLowerCase("ko-KR")));
  return draft
    .split(/[,\r\n]+/u)
    .map((label) => label.trim())
    .filter((label) => {
      if (!label) return false;
      const normalized = label.toLocaleLowerCase("ko-KR");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function stableKeywordId(groupId: string, label: string, seed: string | number) {
  let hash = 2166136261;
  for (const character of `${groupId}:${label}:${seed}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${groupId}-keyword-${(hash >>> 0).toString(36)}`;
}

export function createTagKeyword(groupId: string, label: string, seed: string | number): TagKeyword {
  return { id: stableKeywordId(groupId, label, seed), label };
}

function normalizeTagGroup(group: TagGroup): NormalizedTagGroup {
  const keywords = group.keywords?.length
    ? group.keywords.map((keyword) => ({ ...keyword }))
    : group.items.map((label, index) => createTagKeyword(group.id, label, index));
  return { ...group, items: keywords.map((keyword) => keyword.label), keywords };
}

export function normalizeTagGroups(content: TagsContent): NormalizedTagGroup[] {
  if (content.groups?.length) return content.groups.map(normalizeTagGroup);
  return [normalizeTagGroup({ id: "keywords", title: "기타", items: [...content.items] })];
}

export function serializeTagGroups(groups: TagGroup[]): TagsContent {
  const normalized = groups.map(normalizeTagGroup).map((group) => {
    const keywords = group.keywords.filter((keyword) => keyword.label.trim()).map((keyword) => ({ ...keyword, label: keyword.label.trim() }));
    return { ...group, title: group.title.trim(), items: keywords.map((keyword) => keyword.label), keywords };
  });
  return { items: normalized.flatMap((group) => group.items), groups: normalized };
}
