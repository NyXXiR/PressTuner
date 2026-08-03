"use client";

import { updateCareerCurrentState } from "@/domain/career-memory/careerFormPayload";

export type CareerExperienceDraft = {
  title: string;
  content: string;
  organization: string | null;
  roleTitle: string | null;
  experienceType: "WORK" | "PROJECT" | "EDUCATION" | "ACTIVITY" | "AWARD" | "OTHER";
  period: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  actions: string[];
  outcomes: string[];
  metrics: string[];
  tools: string[];
  tags: string[];
};

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="block text-xs font-bold">
      {label}
      <textarea
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        className="mt-1 min-h-20 w-full border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
        placeholder="한 줄에 하나씩 입력"
      />
    </label>
  );
}

export function CareerExperienceFields({
  value,
  onChange,
}: {
  value: CareerExperienceDraft;
  onChange: (value: CareerExperienceDraft) => void;
}) {
  const set = <K extends keyof CareerExperienceDraft>(
    key: K,
    next: CareerExperienceDraft[K],
  ) => onChange({ ...value, [key]: next });
  const dateOrderError =
    !value.isCurrent &&
    Boolean(value.startDate) &&
    Boolean(value.endDate) &&
    value.endDate! < value.startDate!;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-bold sm:col-span-2">
        경험 이름
        <input
          value={value.title}
          onChange={(event) => set("title", event.target.value)}
          className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary"
        />
      </label>
      <label className="block text-xs font-bold">
        조직
        <input
          value={value.organization ?? ""}
          onChange={(event) => set("organization", event.target.value || null)}
          className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary"
        />
      </label>
      <label className="block text-xs font-bold">
        역할
        <input
          value={value.roleTitle ?? ""}
          onChange={(event) => set("roleTitle", event.target.value || null)}
          className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary"
        />
      </label>
      <label className="block text-xs font-bold">
        유형
        <select
          value={value.experienceType}
          onChange={(event) =>
            set(
              "experienceType",
              event.target.value as CareerExperienceDraft["experienceType"],
            )
          }
          className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary"
        >
          <option value="WORK">업무</option>
          <option value="PROJECT">프로젝트</option>
          <option value="EDUCATION">교육</option>
          <option value="ACTIVITY">활동</option>
          <option value="AWARD">수상</option>
          <option value="OTHER">기타</option>
        </select>
      </label>
      <label className="flex items-end gap-2 pb-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={value.isCurrent}
          onChange={(event) =>
            onChange(updateCareerCurrentState(value, event.target.checked))
          }
        />
        현재 진행 중
      </label>
      <label className="block text-xs font-bold">
        시작일
        <input
          type="date"
          value={value.startDate?.slice(0, 10) ?? ""}
          onChange={(event) => set("startDate", event.target.value || null)}
          className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary"
        />
      </label>
      <label className="block text-xs font-bold">
        종료일
        <input
          type="date"
          disabled={value.isCurrent}
          aria-invalid={Boolean(dateOrderError)}
          aria-describedby={dateOrderError ? "career-end-date-error" : undefined}
          value={value.endDate?.slice(0, 10) ?? ""}
          onChange={(event) => set("endDate", event.target.value || null)}
          className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary disabled:opacity-50"
        />
        {dateOrderError && (
          <span id="career-end-date-error" className="mt-1 block text-destructive" role="alert">
            종료일은 시작일보다 빠를 수 없습니다.
          </span>
        )}
      </label>
      <label className="block text-xs font-bold sm:col-span-2">
        요약
        <textarea
          value={value.content}
          onChange={(event) => set("content", event.target.value)}
          className="mt-1 min-h-28 w-full border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
        />
      </label>
      <ListField label="행동" value={value.actions} onChange={(next) => set("actions", next)} />
      <ListField label="결과" value={value.outcomes} onChange={(next) => set("outcomes", next)} />
      <ListField label="수치" value={value.metrics} onChange={(next) => set("metrics", next)} />
      <ListField label="도구" value={value.tools} onChange={(next) => set("tools", next)} />
      <ListField label="태그" value={value.tags} onChange={(next) => set("tags", next)} />
    </div>
  );
}
