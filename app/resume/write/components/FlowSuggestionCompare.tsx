"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

import type { FlowQuestion } from "@/domain/resume-writing/flowMachine";

import type { FlowDispatch } from "./flowViewTypes";

const TABS = [
  { key: "compare", label: "비교하기" },
  { key: "revised", label: "수정본만" },
  { key: "original", label: "이전 내용만" },
] as const;

type PreviewTab = (typeof TABS)[number]["key"];

type FlowSuggestionCompareProps = {
  readonly question: FlowQuestion;
  readonly onAction: FlowDispatch;
};

export function FlowSuggestionCompare({ question, onAction }: FlowSuggestionCompareProps) {
  const [tab, setTab] = useState<PreviewTab>("compare");
  const suggestion = question.pendingSuggestion;
  if (!suggestion) return null;

  return (
    <section className="flex flex-1 flex-col" aria-label="AI 수정안 비교">
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 text-xs font-bold transition-colors ${
              tab === item.key
                ? "bg-foreground text-background"
                : "border border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex-1 bg-muted/30 p-4 sm:p-5">
        {tab === "compare" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <CompareCard label="현재 원고 (잉크)" body={suggestion.original} tone="muted" />
            <CompareCard label="수정안 (연필)" body={suggestion.revised} tone="primary" />
          </div>
        ) : (
          <CompareCard
            label={tab === "revised" ? "수정안 (연필)" : "현재 원고 (잉크)"}
            body={tab === "revised" ? suggestion.revised : suggestion.original}
            tone={tab === "revised" ? "primary" : "muted"}
          />
        )}
      </div>
      <footer className="flex flex-col gap-3 border-t border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-muted-foreground">현재 답변은 적용하기 전까지 바뀌지 않습니다.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction({ type: "discard_suggestion" })}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 border border-border bg-background px-4 text-xs font-bold transition-colors hover:bg-muted sm:flex-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            적용 취소
          </button>
          <button
            type="button"
            onClick={() => onAction({ type: "apply_suggestion" })}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            수정안 적용
          </button>
        </div>
      </footer>
    </section>
  );
}

function CompareCard({
  label,
  body,
  tone,
}: {
  readonly label: string;
  readonly body: string;
  readonly tone: "muted" | "primary";
}) {
  return (
    <div
      className={`border bg-card p-4 ${
        tone === "primary" ? "border-[1.5px] border-dashed border-ai" : "border-border"
      }`}
    >
      <p
        className={`mb-3 text-[11px] font-extrabold tracking-[0.14em] ${
          tone === "primary" ? "text-ai" : "text-muted-foreground"
        }`}
      >
        {label}
      </p>
      <p className="wg-ruled whitespace-pre-wrap text-sm text-foreground">{body}</p>
    </div>
  );
}
