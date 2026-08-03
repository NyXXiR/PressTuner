"use client";

import { CalendarDays, X } from "lucide-react";
import clsx from "clsx";

type DateInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
};

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateInput({
  label,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder = "날짜 선택",
  className,
}: DateInputProps) {
  const blocked = disabled || readOnly;

  const setToday = () => onChange(toDateValue(new Date()));
  const setTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    onChange(toDateValue(tomorrow));
  };

  return (
    <div className={clsx("border border-border bg-background p-3", className)}>
      {label ? (
        <div className="mb-2 text-xs font-bold text-primary">{label}</div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label ?? placeholder}
            className="h-11 w-full border border-border bg-card pl-10 pr-10 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary disabled:opacity-50"
          />
          {value && !blocked ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="날짜 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {!blocked ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <button
              type="button"
              onClick={setToday}
              className="h-10 border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={setTomorrow}
              className="h-10 border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted"
            >
              내일
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
