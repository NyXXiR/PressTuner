export type CareerDates = {
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
};

function monthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

const MONTH_NUMBER_BY_NAME: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function validateDateObjects(dates: CareerDates) {
  if (dates.startDate && Number.isNaN(dates.startDate.getTime())) {
    throw new Error("Invalid date object");
  }
  if (dates.endDate && Number.isNaN(dates.endDate.getTime())) {
    throw new Error("Invalid date object");
  }
}

function formatMonth(date: Date) {
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function validateCareerDates(dates: CareerDates): void {
  validateDateObjects(dates);
  if (dates.isCurrent && dates.endDate) throw new Error("Current experiences cannot have an end date");
  if (dates.startDate && dates.endDate && dates.startDate > dates.endDate) {
    throw new Error("End date cannot precede start date");
  }
}

export function normalizeCareerDates(dates: CareerDates): CareerDates {
  validateDateObjects(dates);
  const normalized = { ...dates, endDate: dates.isCurrent ? null : dates.endDate };
  validateCareerDates(normalized);
  return normalized;
}

export function deriveCareerPeriod(dates: CareerDates): string | null {
  const normalized = normalizeCareerDates(dates);
  if (normalized.startDate) {
    if (normalized.isCurrent) return `${formatMonth(normalized.startDate)} - Present`;
    return normalized.endDate
      ? `${formatMonth(normalized.startDate)} - ${formatMonth(normalized.endDate)}`
      : formatMonth(normalized.startDate);
  }
  if (normalized.endDate) return `Until ${formatMonth(normalized.endDate)}`;
  return normalized.isCurrent ? "Present" : null;
}

export function parseLegacyCareerPeriod(period: string): CareerDates {
  const invalid = (): never => {
    throw new Error("Invalid legacy career period");
  };
  const value = period.trim().replace(/[–—]/g, "-").replace(/\s+/g, " ");

  // Real legacy rows used an ISO-like month token with a tilde separator. Keep
  // the hyphen-separated form fail-closed so full/ambiguous ISO dates are not
  // accidentally reinterpreted as periods.
  const isoMonthTilde = value.match(
    /^((?:19|20)\d{2})-(0[1-9]|1[0-2])\s*~\s*(?:((?:19|20)\d{2})-(0[1-9]|1[0-2])|(현재|present))$/i,
  );
  if (isoMonthTilde) {
    const startDate = monthStart(Number(isoMonthTilde[1]), Number(isoMonthTilde[2]));
    const isCurrent = Boolean(isoMonthTilde[5]);
    const endDate = isCurrent
      ? null
      : monthStart(Number(isoMonthTilde[3]), Number(isoMonthTilde[4]));
    const dates = { startDate, endDate, isCurrent };
    validateCareerDates(dates);
    return dates;
  }

  if (/\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/.test(value)) invalid();

  const parsePart = (part: string, end: boolean) => {
    const canonicalMonth = part.match(/^((?:19|20)\d{2})\.(0[1-9]|1[0-2])$/);
    if (canonicalMonth) return monthStart(Number(canonicalMonth[1]), Number(canonicalMonth[2]));

    const yearOnly = part.match(/^((?:19|20)\d{2})$/);
    if (yearOnly) return monthStart(Number(yearOnly[1]), end ? 12 : 1);

    const monthNames = Object.keys(MONTH_NUMBER_BY_NAME).join("|");
    const monthFirst = part.match(new RegExp(`^(${monthNames})\\s*,?\\s*((?:19|20)\\d{2})$`, "i"));
    if (monthFirst) {
      return monthStart(Number(monthFirst[2]), MONTH_NUMBER_BY_NAME[monthFirst[1].toLowerCase()]);
    }
    const yearFirst = part.match(new RegExp(`^((?:19|20)\\d{2})\\s*,?\\s*(${monthNames})$`, "i"));
    if (yearFirst) {
      return monthStart(Number(yearFirst[1]), MONTH_NUMBER_BY_NAME[yearFirst[2].toLowerCase()]);
    }
    return invalid();
  };

  if (value === "Present") {
    return { startDate: null, endDate: null, isCurrent: true };
  }
  if (/^(?:19|20)\d{2}\.(?:0[1-9]|1[0-2])$/.test(value)) {
    return { startDate: parsePart(value, false), endDate: null, isCurrent: false };
  }
  const untilMonth = value.match(/^Until ((?:19|20)\d{2}\.(?:0[1-9]|1[0-2]))$/);
  if (untilMonth) {
    return { startDate: null, endDate: parsePart(untilMonth[1], true), isCurrent: false };
  }

  const parts = value.split(/\s*-\s*/);
  if (parts.length !== 2 || parts.some((part) => !part)) invalid();
  if (/^(present|current|now)$/i.test(parts[0])) invalid();
  const startDate = parsePart(parts[0], false);
  const isCurrent = /^(present|current|now)$/i.test(parts[1]);
  const endDate = isCurrent ? null : parsePart(parts[1], true);
  const dates = { startDate, endDate, isCurrent };
  validateCareerDates(dates);
  return dates;
}
