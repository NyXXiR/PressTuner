const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function createLocalDate(year: number, monthIndex: number, day: number) {
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, monthIndex, day);
  return date;
}

function startOfLocalMonth(date: Date) {
  return createLocalDate(date.getFullYear(), date.getMonth(), 1);
}

export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = createLocalDate(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatDateOnly(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalCalendarDays(date: Date, days: number) {
  const result = createLocalDate(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

export function resolveSelectionBounds(min?: string, max?: string) {
  const parsedMin = min ? parseDateOnly(min) : null;
  const parsedMax = max ? parseDateOnly(max) : null;

  if (parsedMin && parsedMax && parsedMin > parsedMax) {
    return { min: null, max: null };
  }

  return { min: parsedMin, max: parsedMax };
}

export function isDateOnlyWithinBounds(value: string, min?: string, max?: string) {
  const date = parseDateOnly(value);
  if (!date) return false;

  const bounds = resolveSelectionBounds(min, max);
  return (!bounds.min || date >= bounds.min) && (!bounds.max || date <= bounds.max);
}

type NavigationMonthOptions = {
  today?: Date;
  startMonth?: string;
  endMonth?: string;
};

export function resolveNavigationMonths({
  today = new Date(),
  startMonth,
  endMonth,
}: NavigationMonthOptions = {}) {
  const defaultStart = createLocalDate(today.getFullYear() - 100, 0, 1);
  const defaultEnd = createLocalDate(today.getFullYear() + 10, 11, 1);
  const parsedStart = startMonth ? parseDateOnly(startMonth) : null;
  const parsedEnd = endMonth ? parseDateOnly(endMonth) : null;
  const resolvedStart = parsedStart ? startOfLocalMonth(parsedStart) : defaultStart;
  const resolvedEnd = parsedEnd ? startOfLocalMonth(parsedEnd) : defaultEnd;

  if (resolvedStart > resolvedEnd) {
    return { startMonth: defaultStart, endMonth: defaultEnd };
  }

  return { startMonth: resolvedStart, endMonth: resolvedEnd };
}

type InitialCalendarMonthOptions = NavigationMonthOptions & {
  value?: string;
  defaultMonth?: string;
};

export function resolveInitialCalendarMonth({
  value,
  defaultMonth,
  today = new Date(),
  startMonth,
  endMonth,
}: InitialCalendarMonthOptions = {}) {
  const navigation = resolveNavigationMonths({ today, startMonth, endMonth });
  const candidate = parseDateOnly(value ?? "") ?? parseDateOnly(defaultMonth ?? "") ?? today;
  const month = startOfLocalMonth(candidate);

  if (month < navigation.startMonth) return navigation.startMonth;
  if (month > navigation.endMonth) return navigation.endMonth;
  return month;
}
