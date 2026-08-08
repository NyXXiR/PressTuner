const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTimeKo(
  value: string | Date,
  now: Date = new Date(),
): string {
  const time = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  const elapsed = now.getTime() - time.getTime();
  const utcDay = (date: Date) =>
    Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY);
  const dayDiff = utcDay(now) - utcDay(time);
  if (elapsed < MINUTE) return "방금 전";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}분 전`;
  if (dayDiff === 0) return `${Math.floor(elapsed / HOUR)}시간 전`;
  if (dayDiff === 1) return "어제";
  if (dayDiff < 30) return `${dayDiff}일 전`;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${time.getUTCFullYear()}.${pad(time.getUTCMonth() + 1)}.${pad(time.getUTCDate())}`;
}
