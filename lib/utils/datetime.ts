// lib/utils/datetime.ts

/**
 * ✅ 원칙
 * - 서버/DB/네트워크 교환: ISO 8601 (예: 2026-01-24T03:00:00.000Z)
 * - UI 표시: formatYMDHM 같은 명시적 포맷 함수 사용
 * - datetime-local 입력은 "로컬 시간"이므로, ISO 변환/파싱을 따로 제공
 */

/** pad helper */
const pad2 = (n: number) => n.toString().padStart(2, "0");
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Date → "YYYY-MM-DD HH:mm" (로컬 시간 기준)
 * - UI 표시/로그에 사용
 */
export function formatYMDHM(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Date → ISO string
 * - 서버 교환 표준
 */
export function formatISO(date: Date): string {
  return date.toISOString();
}

/**
 * ISO 또는 Date-like 입력을 Date로 안전하게 파싱
 * - ISO(권장), RFC2822, timestamp(ms), Date 지원
 * - 파싱 실패 시 null
 */
export function parseDate(input?: string | number | Date | null): Date | null {
  if (input == null) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(input).trim();
  if (!s) return null;

  // 숫자 문자열(timestamp)도 허용
  if (/^\d+$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO/RFC 파싱 시도 (브라우저 표준)
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;

  // 마지막 fallback: "YYYY-MM-DD HH:mm" (기존 호환)
  const fallback = parseYMDHM(s);
  return fallback;
}

/**
 * 한국어/느슨한 날짜 문자열을 Date로 안전하게 파싱
 * - 예: "2026년 4월 19일 23:59", "2026-04-19", "2026.04.19 18:00"
 * - 파싱 실패 시 null
 */
export function parseLooseDate(input?: string | number | Date | null): Date | null {
  const direct = parseDate(input);
  if (direct) return direct;
  if (input == null) return null;

  const text = String(input).trim();
  if (!text) return null;

  const normalized = text
    .replace(/[년/.]/g, "-")
    .replace(/월/g, "-")
    .replace(/일/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const datetimeMatch = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+|T)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (datetimeMatch) {
    const [, y, mo, d, h, mi, s] = datetimeMatch;
    const date = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s ?? 0),
      0,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnlyMatch) {
    const [, y, mo, d] = dateOnlyMatch;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * 느슨한 입력을 DB 저장용 Date로 변환
 * - 유효하지 않으면 null
 */
export function toValidDateOrNull(input?: string | number | Date | null): Date | null {
  return parseLooseDate(input);
}

/**
 * 날짜를 YYYY-MM-DD 문자열로 안전하게 변환
 * - 유효하지 않으면 null
 */
export function toISODateOnly(input?: string | number | Date | null): string | null {
  const date = parseLooseDate(input);
  if (!date) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * "YYYY-MM-DD HH:mm" 또는 "YYYY-MM-DDTHH:mm" → Date (로컬 시간)
 * - 기존 parseYMDHM 확장: 'T'도 허용
 */
export function parseYMDHM(input?: string | null): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // "YYYY-MM-DD HH:mm" or "YYYY-MM-DDTHH:mm"
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;

  const [, y, mo, d, h, mi] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  // 로컬 시간으로 생성
  const date = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * ISO string → "YYYY-MM-DD HH:mm" (로컬 시간)
 * - 서버에서 받은 ISO를 UI에 표시할 때 사용
 */
export function formatYMDHMFromISO(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return formatYMDHM(d);
}

/**
 * ISO string → datetime-local("YYYY-MM-DDTHH:mm") (로컬 시간)
 * - 서버에서 받은 ISO를 input에 바인딩할 때
 */
export function toDatetimeLocal(value?: string | null): string {
  const d = parseDate(value);
  if (!d) return "";

  // datetime-local은 로컬 기준 값을 요구
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * datetime-local("YYYY-MM-DDTHH:mm") → ISO string (UTC)
 * - input에서 받은 로컬 시간을 서버로 보낼 때 "표준 ISO"로 변환
 */
export function fromDatetimeLocalToISO(value?: string | null): string {
  if (!value) return "";
  const s = value.trim();
  if (!s) return "";

  const d = parseYMDHM(s); // 'T' 지원
  if (!d) return "";

  return d.toISOString();
}

/**
 * (호환용) datetime-local → "YYYY-MM-DD HH:mm"
 * - 기존 함수명 유지
 * - 서버가 여전히 YMDHM을 요구하는 곳이 있으면 사용
 */
export function fromDatetimeLocal(value?: string | null): string {
  if (!value) return "";
  const s = value.trim();
  if (!s) return "";
  const base = s.length > 16 ? s.slice(0, 16) : s;
  return base.replace("T", " ");
}

export type EventPublishRelation = "future" | "pastOrSame" | "unknown";

/**
 * eventAt / publishAt 관계를 분류
 * - publishAt이 없으면 "지금"을 게재 시점으로 가정
 *
 * ✅ eventAt/publishAt 모두 ISO 또는 "YYYY-MM-DD HH:mm" 모두 허용
 */
export function getEventPublishRelation(
  eventAt?: string | null,
  publishAt?: string | null
): EventPublishRelation {
  const eventDate = parseDate(eventAt);
  if (!eventDate) return "unknown";

  const publishDate = parseDate(publishAt) ?? new Date();

  if (eventDate.getTime() > publishDate.getTime()) return "future";
  return "pastOrSame";
}

// -----------------------------
// KST 범위 헬퍼
// -----------------------------

function toKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function fromKst(date: Date): Date {
  return new Date(date.getTime() - KST_OFFSET_MS);
}

/**
 * KST 기준 오늘의 UTC 범위 반환
 */
export function kstTodayUtcRange() {
  const now = new Date();
  const kstNow = toKst(now);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();

  const kstStart = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const startUtc = fromKst(kstStart);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

/**
 * KST 기준 지난 7일(오늘 포함) UTC 범위 반환
 */
export function kstLast7DaysUtcRange() {
  const { startUtc: todayStartUtc } = kstTodayUtcRange();
  const startUtc = new Date(todayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
  const endUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

/**
 * KST 기준 이번 달 UTC 범위 반환
 */
export function kstMonthUtcRange() {
  const now = new Date();
  const kstNow = toKst(now);

  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();

  const monthStartKst = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const startUtc = fromKst(monthStartKst);
  const nextMonthKst = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  const endUtc = fromKst(nextMonthKst);

  return { startUtc, endUtc };
}
