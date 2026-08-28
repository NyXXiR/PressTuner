"use client";

import { useRef } from "react";

import type { ItemContent } from "@/domain/resume-documents/model";
import { resolveResumeItemDatePolicy } from "@/domain/resume-documents/itemDatePolicy";

export type ResumeItemDatePatch = Pick<ItemContent, "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">;

type Props = {
  value: Pick<ItemContent, "itemKind" | "detailType" | "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">;
  sectionId?: string;
  disabled?: boolean;
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

export function ResumeItemDateFields({ value, sectionId, disabled = false, onChange }: Props) {
  const policy = resolveResumeItemDatePolicy(value, sectionId);
  const rememberedEndMonth = useRef(value.endMonth || "");
  if (policy.dateMode === "none") return null;

  const endEnabled = policy.endBehavior === "always"
    || (policy.endBehavior === "optional" && (value.endMonthEnabled ?? Boolean(value.endMonth)))
    && !value.isCurrent;
  const endLabel = policy.endMeaning ? endLabels[policy.endMeaning] : "종료 연월";
  const optionalLabel = policy.endMeaning === "expires" ? "유효기간 있음" : "종료 시점 있음";
  const endInput = <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
    {endLabel}
    <input className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground disabled:bg-muted" data-resume-date-field="endMonth" disabled={disabled || Boolean(value.isCurrent)} type="month" value={value.endMonth ?? ""} onChange={(event) => { rememberedEndMonth.current = event.target.value; onChange({ endMonth: event.target.value, endMonthEnabled: true }); }} />
  </label>;

  return <>
    <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
      {startLabels[policy.startMeaning]}
      <input className="h-10 border border-border bg-background px-3 text-sm font-normal text-foreground disabled:bg-muted" data-resume-date-field="startMonth" disabled={disabled} type="month" value={value.startMonth ?? ""} onChange={(event) => onChange({ startMonth: event.target.value })} />
    </label>
    {policy.endBehavior === "always" && endInput}
    {policy.endBehavior === "optional" && <div className="grid content-end gap-2">
      <label className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-foreground"><input checked={endEnabled} disabled={disabled || Boolean(value.isCurrent)} type="checkbox" onChange={(event) => {
        if (!event.target.checked && value.endMonth) rememberedEndMonth.current = value.endMonth;
        onChange(event.target.checked
          ? { endMonthEnabled: true, endMonth: rememberedEndMonth.current || value.startMonth || localMonth(), isCurrent: false }
          : { endMonthEnabled: false });
      }} /> {optionalLabel}</label>
      {endEnabled && endInput}
    </div>}
    {policy.ongoingMeaning && <label className="inline-flex items-center gap-2 self-end pb-2 text-xs font-bold text-foreground"><input checked={Boolean(value.isCurrent)} disabled={disabled} type="checkbox" onChange={(event) => onChange(event.target.checked
      ? { isCurrent: true, endMonthEnabled: false }
      : { isCurrent: false, endMonthEnabled: policy.endBehavior === "always" ? true : value.endMonthEnabled })} /> {ongoingLabels[policy.ongoingMeaning]}</label>}
  </>;
}
