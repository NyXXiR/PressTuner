"use client";

import { DayPicker, type Matcher } from "@daypicker/react";
import { ko } from "@daypicker/react/locale";
import clsx from "clsx";
import { CalendarDays, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  addLocalCalendarDays,
  formatDateOnly,
  isDateOnlyWithinBounds,
  parseDateOnly,
  resolveInitialCalendarMonth,
  resolveNavigationMonths,
  resolveSelectionBounds,
} from "./dateOnly";

export type DateInputQuickAction = "today" | "tomorrow";

export type DateInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  min?: string;
  max?: string;
  startMonth?: string;
  endMonth?: string;
  defaultMonth?: string;
  reverseYears?: boolean;
  quickActions?: readonly DateInputQuickAction[];
};

const DEFAULT_QUICK_ACTIONS: readonly DateInputQuickAction[] = ["today", "tomorrow"];

export function DateInput({
  label,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = "날짜 선택",
  className,
  min,
  max,
  startMonth,
  endMonth,
  defaultMonth,
  reverseYears = false,
  quickActions = DEFAULT_QUICK_ACTIONS,
}: DateInputProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const descriptionId = `${baseId}-description`;
  const popoverId = `${baseId}-calendar`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const blocked = disabled || readOnly;
  const today = new Date();
  const currentYear = today.getFullYear();
  const navigation = resolveNavigationMonths({
    today: new Date(currentYear, 0, 1),
    startMonth,
    endMonth,
  });
  const selectionBounds = resolveSelectionBounds(min, max);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    resolveInitialCalendarMonth({ value, defaultMonth, startMonth, endMonth }),
  );
  const visibleMonth = resolveInitialCalendarMonth({
    value: formatDateOnly(month),
    startMonth: formatDateOnly(navigation.startMonth),
    endMonth: formatDateOnly(navigation.endMonth),
  });
  const calendarOpen = open && !blocked;

  const restoreTriggerFocus = useCallback(() => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    restoreTriggerFocus();
  }, [restoreTriggerFocus]);

  useEffect(() => {
    if (!blocked) return;
    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [blocked]);

  useEffect(() => {
    if (!calendarOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [calendarOpen, closeAndRestoreFocus]);

  const selected = parseDateOnly(value) ?? undefined;
  const nativeMin = selectionBounds.min ? formatDateOnly(selectionBounds.min) : undefined;
  const nativeMax = selectionBounds.max ? formatDateOnly(selectionBounds.max) : undefined;
  const disabledMatchers: Matcher[] = [];
  if (selectionBounds.min) disabledMatchers.push({ before: selectionBounds.min });
  if (selectionBounds.max) disabledMatchers.push({ after: selectionBounds.max });

  const quickActionValues: Record<DateInputQuickAction, { label: string; value: string }> = {
    today: { label: "오늘", value: formatDateOnly(today) },
    tomorrow: {
      label: "내일",
      value: formatDateOnly(addLocalCalendarDays(today, 1)),
    },
  };

  const emitDate = (nextValue: string) => {
    if (nextValue === "") {
      onChange("");
      return true;
    }
    if (!isDateOnlyWithinBounds(nextValue, min, max)) return false;
    onChange(nextValue);
    return true;
  };

  const toggleCalendar = () => {
    if (blocked) return;
    if (!open) {
      setMonth(
        resolveInitialCalendarMonth({ value, defaultMonth, startMonth, endMonth }),
      );
    }
    setOpen((current) => !current);
  };

  return (
    <div
      ref={rootRef}
      className={clsx("date-input border border-border bg-background p-3", className)}
    >
      {label ? (
        <label htmlFor={inputId} className="mb-2 block text-xs font-bold text-primary">
          {label}
        </label>
      ) : null}
      <span id={descriptionId} className="sr-only">
        YYYY-MM-DD 형식으로 입력하거나 달력에서 날짜를 선택하세요.
      </span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="date-input__control relative min-w-0 flex-1">
          <button
            ref={triggerRef}
            type="button"
            disabled={blocked}
            onClick={toggleCalendar}
            aria-label={`${label ?? placeholder} 달력 열기`}
            aria-describedby={descriptionId}
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            aria-controls={popoverId}
            className="date-input__trigger absolute left-1.5 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <input
            id={inputId}
            type="date"
            value={value}
            min={nativeMin}
            max={nativeMax}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(event) => emitDate(event.target.value)}
            aria-label={label ?? placeholder}
            aria-describedby={descriptionId}
            className="h-11 w-full border border-border bg-card pl-10 pr-10 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary disabled:opacity-50"
          />
          {value && !blocked ? (
            <button
              type="button"
              onClick={() => emitDate("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="날짜 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {calendarOpen ? (
            <div className="date-input__popover">
              <DayPicker
                id={popoverId}
                className="date-input__calendar"
                mode="single"
                selected={selected}
                month={visibleMonth}
                onMonthChange={setMonth}
                captionLayout="dropdown"
                navLayout="after"
                reverseYears={reverseYears}
                startMonth={navigation.startMonth}
                endMonth={navigation.endMonth}
                disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
                locale={ko}
                role="dialog"
                aria-label={`${label ?? "날짜"} 선택 달력`}
                onSelect={(date) => {
                  if (!date) return;
                  if (emitDate(formatDateOnly(date))) closeAndRestoreFocus();
                }}
              />
            </div>
          ) : null}
        </div>
        {!blocked && quickActions.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            {quickActions.map((action) => {
              const item = quickActionValues[action];
              const available = isDateOnlyWithinBounds(item.value, min, max);
              return (
                <button
                  key={action}
                  type="button"
                  disabled={!available}
                  onClick={() => emitDate(item.value)}
                  className="h-10 border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
