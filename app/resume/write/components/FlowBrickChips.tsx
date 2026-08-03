"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Layers3, Plus, X } from "lucide-react";

import type {
  FlowQuestion,
  ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";

import type { FlowDispatch } from "./flowViewTypes";

type FlowBrickChipsProps = {
  readonly state: ResumeWriteFlowState;
  readonly question: FlowQuestion;
  readonly onAction: FlowDispatch;
};

export function FlowBrickChips({ state, question, onAction }: FlowBrickChipsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const completed = question.status === "completed";
  const linked = state.userBricks.filter((brick) =>
    question.linkedBrickIds.includes(brick.id),
  );

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [pickerOpen]);

  if (state.userBricks.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
        <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
        연결할 경력 기억이 아직 없어요. 경력 기억 화면에서 승인할 수 있습니다.
      </p>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-muted-foreground">재료</span>
        {linked.map((brick) => (
          <span
            key={brick.id}
            className="inline-flex h-7 items-center gap-1 border border-primary/25 bg-primary/5 pl-2.5 pr-1 text-[11px] font-bold text-primary"
          >
            {brick.title}
            {!completed && (
              <button
                type="button"
                onClick={() =>
                  onAction({
                    type: "toggle_brick_link",
                    questionId: question.id,
                    brickId: brick.id,
                  })
                }
                aria-label={`${brick.title} 연결 해제`}
                className="inline-flex h-5 w-5 items-center justify-center text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {linked.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            연결된 경험 없음
          </span>
        )}
        {!completed && (
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            className="inline-flex h-7 items-center gap-1 border border-dashed border-border px-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            경험 추가
          </button>
        )}
      </div>

      {pickerOpen && !completed && (
        <div
          role="listbox"
          aria-label="연결할 경험 선택"
          className="absolute left-0 top-full z-30 mt-2 max-h-64 w-full min-w-64 max-w-sm overflow-y-auto border border-border bg-card p-1.5 shadow-lg"
        >
          {state.userBricks.map((brick) => {
            const isLinked = question.linkedBrickIds.includes(brick.id);
            return (
              <button
                key={brick.id}
                type="button"
                role="option"
                aria-selected={isLinked}
                onClick={() =>
                  onAction({
                    type: "toggle_brick_link",
                    questionId: question.id,
                    brickId: brick.id,
                  })
                }
                className={`flex w-full items-start gap-2 p-2.5 text-left transition-colors ${
                  isLinked ? "bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <span
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border ${
                    isLinked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background"
                  }`}
                  aria-hidden="true"
                >
                  {isLinked && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold leading-5">
                    {brick.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {brick.tags.map((tag) => `#${tag}`).join(" ")}
                  </span>
                </span>
              </button>
            );
          })}
          <p className="border-t border-border px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
            연결을 바꾼 뒤 초안을 다시 만들거나 수정을 요청하면 반영됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
