export type QuotaStatus = "available" | "near_limit" | "limited";

export type QuotaView = {
  unlimited: boolean;
  remaining: number;
  limit: number;
  used: number;
  percentUsed: number;
  percentRemaining: number;
  status: QuotaStatus;
  resetAtLabel: string;
  resetRelativeLabel: string;
};

type QuotaInput = {
  unlimited?: boolean;
  limit?: number;
  usage?: number;
  remaining?: number;
  resetAt?: string;
  resetLabel?: string;
  status?: QuotaStatus;
};

const DISPLAY_TIME_ZONE = "Asia/Seoul";

function formatResetAt(date: Date, now: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: DISPLAY_TIME_ZONE,
  };
  const parts = new Intl.DateTimeFormat("ko-KR", options).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  const currentYear = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(now);
  const yearLabel = values.year === currentYear ? "" : `${values.year}년 `;
  return `${yearLabel}${values.month}월 ${values.day}일 ${values.hour}:${values.minute}`;
}

function formatRelativeReset(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 60000));
  if (minutes < 1) return "곧";
  if (minutes < 60) return `약 ${minutes}분 후`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes === 0
      ? `약 ${hours}시간 후`
      : `약 ${hours}시간 ${restMinutes}분 후`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `약 ${days}일 ${restHours}시간 후` : `약 ${days}일 후`;
}

function formatServerResetLabel(resetLabel: string): string | null {
  const label = resetLabel.trim();
  if (!label) return null;
  if (label.startsWith("곧")) return "곧";
  if (label.startsWith("약 ") || label.endsWith("후")) return label;
  return `약 ${label} 후`;
}

export function toQuotaView(input: QuotaInput, now = new Date()): QuotaView {
  const unlimited = input.unlimited === true;
  const limit = Math.max(0, input.limit ?? 0);
  const usage = Math.max(0, input.usage ?? 0);
  const remaining = Math.max(0, input.remaining ?? limit - usage);
  const used = Math.max(0, input.usage ?? limit - remaining);
  const percentUsed = limit > 0
    ? Math.round(Math.min(100, Math.max(0, (used / limit) * 100)))
    : 0;
  const percentRemaining = limit > 0
    ? Math.round(Math.min(100, Math.max(0, (remaining / limit) * 100)))
    : 0;
  const status = unlimited
    ? "available"
    : input.status ??
      (remaining <= 0
        ? "limited"
        : percentUsed >= 80
          ? "near_limit"
          : "available");
  const resetDate = input.resetAt ? new Date(input.resetAt) : null;
  const hasValidReset = resetDate !== null && !Number.isNaN(resetDate.getTime());
  const serverResetLabel = input.resetLabel
    ? formatServerResetLabel(input.resetLabel)
    : null;

  return {
    unlimited,
    remaining,
    limit,
    used,
    percentUsed,
    percentRemaining,
    status,
    resetAtLabel: hasValidReset ? formatResetAt(resetDate, now) : "정보 없음",
    resetRelativeLabel: hasValidReset
      ? serverResetLabel ?? formatRelativeReset(resetDate, now)
      : "정보 없음",
  };
}
