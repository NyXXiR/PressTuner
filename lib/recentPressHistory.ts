// lib/recentPressHistory.ts
export type RecentPressHistoryItem = {
  id: string;
  title: string;
  status: "DRAFT" | "IN_PROGRESS" | "FINAL";
  updatedAt: string; // ISO (서버의 문서 updatedAt)
  lastSeenAt: string; // ISO (내가 접근한 시각)
};

const VERSION = "v1";
const MAX_ITEMS = 20;
const TTL_DAYS = 90;

function key(userId: string, teamId: string) {
  return `press:recent:${VERSION}:${userId}:${teamId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function withinTtl(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const limit = TTL_DAYS * 24 * 60 * 60 * 1000;
  return ms <= limit;
}

export function getRecentPressHistory(userId: string, teamId: string) {
  if (!isBrowser()) return [] as RecentPressHistoryItem[];

  try {
    const raw = localStorage.getItem(key(userId, teamId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? (parsed as RecentPressHistoryItem[])
      : [];

    // TTL 정리
    return items
      .filter((x) => x?.id && x?.lastSeenAt && withinTtl(x.lastSeenAt))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function recordRecentPressHistory(
  userId: string,
  teamId: string,
  item: Omit<RecentPressHistoryItem, "lastSeenAt">
) {
  if (!isBrowser()) return;

  const list = getRecentPressHistory(userId, teamId);
  const seenAt = nowIso();

  // 같은 id가 있으면 제거 후 맨 앞으로
  const next: RecentPressHistoryItem[] = [
    { ...item, lastSeenAt: seenAt },
    ...list.filter((x) => x.id !== item.id),
  ].slice(0, MAX_ITEMS);

  try {
    localStorage.setItem(key(userId, teamId), JSON.stringify(next));
  } catch {
    // storage full 등은 조용히 무시
  }
}

export function clearRecentPressHistory(userId: string, teamId: string) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key(userId, teamId));
  } catch {}
}

export function removeRecentPressHistoryItem(
  userId: string,
  teamId: string,
  articleId: string
) {
  if (typeof window === "undefined") return;

  const list = getRecentPressHistory(userId, teamId);
  const next = list.filter((x) => x.id !== articleId);

  try {
    localStorage.setItem(key(userId, teamId), JSON.stringify(next));
  } catch {}
}

export function touchRecentPressHistoryItem(
  userId: string,
  teamId: string,
  articleId: string
) {
  // 선택: 클릭 시 맨 위로 올리고 싶으면
  if (typeof window === "undefined") return;

  const list = getRecentPressHistory(userId, teamId);
  const found = list.find((x) => x.id === articleId);
  if (!found) return;

  const next = [
    { ...found, lastSeenAt: new Date().toISOString() },
    ...list.filter((x) => x.id !== articleId),
  ].slice(0, 20);

  try {
    localStorage.setItem(key(userId, teamId), JSON.stringify(next));
  } catch {}
}
