import { parseLegacyCareerPeriod } from "./careerPeriod";

export type CareerBrickFormValues = {
  title: string;
  content: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  tags: string[];
};

export type CareerBrickFormInput = {
  title: string;
  content: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  tags?: string[];
};

export type CareerBrickFormSource = {
  title: string;
  content: string;
  tags?: string[] | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean | null;
  period?: string | null;
};

export function updateCareerCurrentState<
  T extends { isCurrent: boolean; endDate: string | null },
>(value: T, isCurrent: boolean): Omit<T, "isCurrent" | "endDate"> & {
  isCurrent: boolean;
  endDate: string | null;
} {
  return {
    ...value,
    isCurrent,
    endDate: isCurrent ? null : value.endDate,
  };
}

function toMonthInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const month = value.match(/^(\d{4})-(\d{2})/);
    if (month) return `${month[1]}-${month[2]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseLegacyPeriodForForm(period: string | null | undefined) {
  if (!period) return null;
  try {
    return parseLegacyCareerPeriod(period);
  } catch {
    const [startValue, endValue] = period.split("~").map((part) => part.trim());
    const toMonth = (value: string | undefined) => {
      const match = value?.match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/);
      return match
        ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
        : null;
    };
    const startDate = toMonth(startValue);
    const isCurrent = /^(현재|present|current|now)$/i.test(endValue ?? "");
    const endDate = isCurrent ? null : toMonth(endValue);
    return startDate || endDate || isCurrent
      ? { startDate, endDate, isCurrent }
      : null;
  }
}

export function careerBrickToFormData(
  brick: CareerBrickFormSource,
): CareerBrickFormValues {
  const shouldUseLegacyPeriod =
    !brick.startDate && !brick.endDate && !brick.isCurrent && Boolean(brick.period);
  const legacy = shouldUseLegacyPeriod
    ? parseLegacyPeriodForForm(brick.period)
    : null;
  const isCurrent = legacy?.isCurrent ?? Boolean(brick.isCurrent);

  return {
    title: brick.title,
    content: brick.content,
    startDate: toMonthInput(legacy?.startDate ?? brick.startDate),
    endDate: isCurrent
      ? ""
      : toMonthInput(legacy?.endDate ?? brick.endDate),
    isCurrent,
    tags: [...(brick.tags ?? [])],
  };
}

export function buildStructuredCareerBrickPayload(
  form: CareerBrickFormInput,
  options: { originalText?: string } = {},
) {
  const isCurrent = Boolean(form.isCurrent);
  return {
    title: form.title,
    content: form.content,
    ...(options.originalText === undefined
      ? {}
      : { originalText: options.originalText }),
    startDate: form.startDate || null,
    endDate: isCurrent ? null : form.endDate || null,
    isCurrent,
    tags: form.tags ?? [],
  };
}
