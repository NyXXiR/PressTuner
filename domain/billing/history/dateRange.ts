// src/domain/billing/history/dateRange.ts

export type HistoryRange = {
  from: Date;
  toExclusive: Date;
  /** "CUSTOM" | "FALLBACK" */
  mode: "CUSTOM" | "FALLBACK";
};

/** YYYY-MM-DD 파싱 */
export function parseYmd(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return { y, mo, d };
}

/**
 * KST 기준 "해당 날짜 00:00"를 Date(UTC)로 만들기
 * - KST 00:00 = UTC 전날 15:00 (9시간 차)
 */
export function kstStartOfDay(ymd: string) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, 0 - 9, 0, 0));
}

/** KST 기준 다음날 00:00 (end exclusive) */
export function kstStartOfNextDay(ymd: string) {
  const p = parseYmd(ymd);
  if (!p) return null;

  // 다음날 계산: UTC 날짜로 +1 (시간은 00:00 유지)
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + 1);

  // KST 00:00 => UTC -9
  return new Date(
    Date.UTC(
      dt.getUTCFullYear(),
      dt.getUTCMonth(),
      dt.getUTCDate(),
      0 - 9,
      0,
      0
    )
  );
}

/**
 * startDate/endDate가 있으면 그 범위(KST 기준)를 사용,
 * 없으면 기본 monthsFallback 개월을 조회.
 */
export function resolveHistoryRange(args: {
  startDate?: string | null;
  endDate?: string | null;
  monthsFallback?: number; // default 3
}): HistoryRange {
  const monthsFallback =
    typeof args.monthsFallback === "number" && args.monthsFallback > 0
      ? Math.floor(args.monthsFallback)
      : 3;

  const startDate = (args.startDate ?? "").trim();
  const endDate = (args.endDate ?? "").trim();

  if (startDate && endDate) {
    const from = kstStartOfDay(startDate);
    const toExclusive = kstStartOfNextDay(endDate);

    if (!from || !toExclusive) {
      const e = new Error("INVALID_DATE") as Error & { status?: number };
      e.status = 400;
      throw e;
    }
    if (from.getTime() > toExclusive.getTime()) {
      const e = new Error("INVALID_RANGE") as Error & { status?: number };
      e.status = 400;
      throw e;
    }
    return { from, toExclusive, mode: "CUSTOM" };
  }

  // fallback
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - monthsFallback);

  return { from, toExclusive: now, mode: "FALLBACK" };
}
