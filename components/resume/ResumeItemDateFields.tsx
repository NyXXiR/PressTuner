"use client";

import { useRef } from "react";

import type { ItemContent } from "@/domain/resume-documents/model";
import { resolveResumeItemDatePolicy } from "@/domain/resume-documents/itemDatePolicy";

export type ResumeItemDatePatch = Pick<ItemContent, "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">;

type Props = {
  value: Pick<ItemContent, "itemKind" | "detailType" | "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">;
  sectionId?: string;
  disabled?: boolean;
  layout?: "grid" | "stack";
  onChange: (patch: Partial<ResumeItemDatePatch>) => void;
};

const startLabels = {
  started: "시작 연월",
  acquired: "취득 연월",
  awarded: "수상 연월",
  tested: "응시·취득 연월",
} as const;
const endLabels = { ended: "종료 연월", graduated: "졸업 연월", expires: "만료 연월" } as const;
const ongoingLabels = { employed: "재직 중", "in-progress": "진행 중", enrolled: "재학 중" } as const;

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ResumeItemDateFields({ value, sectionId, disabled = false, layout = "grid", onChange }: Props) {
  const policy = resolveResumeItemDatePolicy(value, sectionId);
  const rememberedEndMonth = useRef(value.endMonth || "");
  if (policy.dateMode === "none") return null;

  // stack: PDF의 좁은 기간 칸을 그대로 흉내 내는 세로 배치. grid: 부모 2열 그리드에 그대로 흘려보내는 기존 배치.
  const stacked = layout === "stack";
  const labelClass = stacked
    ? "grid gap-1 text-[10px] font-bold tracking-wide text-muted-foreground"
    : "grid gap-1.5 text-xs font-bold text-muted-foreground";
  const inputClass = stacked
    ? "h-9 w-full border border-border bg-background px-2 text-xs font-normal tabular-nums text-foreground disabled:bg-muted"
    : "h-10 border border-border bg-background px-3 text-sm font-normal text-foreground disabled:bg-muted";
  const checkboxClass = stacked
    ? "inline-flex items-center gap-2 text-[11px] font-bold text-foreground"
    : "inline-flex min-h-10 items-center gap-2 text-xs font-bold text-foreground";
  const ongoingClass = stacked
    ? "inline-flex items-center gap-2 text-[11px] font-bold text-foreground"
    : "inline-flex items-center gap-2 self-end pb-2 text-xs font-bold text-foreground";

  const endEnabled = policy.endBehavior === "always"
    || (policy.endBehavior === "optional" && (value.endMonthEnabled ?? Boolean(value.endMonth)))
    && !value.isCurrent;
  const endLabel = policy.endMeaning ? endLabels[policy.endMeaning] : "종료 연월";
  const optionalLabel = policy.endMeaning === "expires" ? "유효기간 있음" : "종료 시점 있음";
  const endInput = <label className={labelClass}>
    {endLabel}
    <input className={inputClass} data-resume-date-field="endMonth" disabled={disabled || Boolean(value.isCurrent)} type="month" value={value.endMonth ?? ""} onChange={(event) => { rememberedEndMonth.current = event.target.value; onChange({ endMonth: event.target.value, endMonthEnabled: true }); }} />
  </label>;

  const startInput = <label className={labelClass}>
    {startLabels[policy.startMeaning]}
    <input className={inputClass} data-resume-date-field="startMonth" disabled={disabled} type="month" value={value.startMonth ?? ""} onChange={(event) => onChange({ startMonth: event.target.value })} />
  </label>;

  const optionalEndGroup = <div className={stacked ? "grid gap-2" : "grid content-end gap-2"}>
    <label className={checkboxClass}><input checked={endEnabled} disabled={disabled || Boolean(value.isCurrent)} type="checkbox" onChange={(event) => {
      if (!event.target.checked && value.endMonth) rememberedEndMonth.current = value.endMonth;
      onChange(event.target.checked
        ? { endMonthEnabled: true, endMonth: rememberedEndMonth.current || value.startMonth || localMonth(), isCurrent: false }
        : { endMonthEnabled: false });
    }} /> {optionalLabel}</label>
    {endEnabled && endInput}
  </div>;

  const ongoingToggle = policy.ongoingMeaning && <label className={ongoingClass}><input checked={Boolean(value.isCurrent)} disabled={disabled} type="checkbox" onChange={(event) => onChange(event.target.checked
    ? { isCurrent: true, endMonthEnabled: false }
    : { isCurrent: false, endMonthEnabled: policy.endBehavior === "always" ? true : value.endMonthEnabled })} /> {ongoingLabels[policy.ongoingMeaning]}</label>;

  if (stacked) return <div className="grid gap-2">
    {startInput}
    {policy.endBehavior === "always" && <><span aria-hidden="true" className="text-center text-[10px] font-bold leading-none text-muted-foreground">~</span>{endInput}</>}
    {policy.endBehavior === "optional" && optionalEndGroup}
    {ongoingToggle}
  </div>;

  return <>
    {startInput}
    {policy.endBehavior === "always" && endInput}
    {policy.endBehavior === "optional" && optionalEndGroup}
    {ongoingToggle}
  </>;
}
