"use client";

import { Loader2 } from "lucide-react";

import type { ResumeWriteFlowState } from "@/domain/resume-writing/flowMachine";

import type { FlowDispatch } from "./flowViewTypes";

type FlowQuestionStripProps = {
  readonly state: ResumeWriteFlowState;
  readonly onAction: FlowDispatch;
};

export function FlowQuestionStrip({ state, onAction }: FlowQuestionStripProps) {
  return (
    <nav aria-label="자기소개서 문항" className="min-w-0 px-0.5">
      <ol className="flex items-end gap-1.5 overflow-x-auto">
        {state.questions.map((question, index) => {
          const active = question.id === state.activeQuestionId;
          const done = question.status === "completed";
          const generating = question.draftStatus === "generating";
          return (
            <li key={question.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() =>
                  onAction({ type: "select_question", questionId: question.id })
                }
                aria-current={active ? "step" : undefined}
                title={question.prompt}
                className={`-mb-px inline-flex items-center gap-1.5 border border-border border-b-0 px-4 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active
                    ? "relative z-10 bg-card py-3 text-foreground"
                    : done
                      ? "bg-primary/10 py-2.5 text-primary hover:bg-primary/15"
                      : "bg-muted py-2.5 text-muted-foreground hover:text-foreground"
                }`}
              >
                {generating && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                문항 {index + 1}
                {done && !active && <span aria-hidden="true"> ✓</span>}
              </button>
              {done && (
                <span
                  aria-label="완료"
                  className="wg-stamp animate-wg-stamp pointer-events-none absolute -right-2 -top-2.5 z-20 h-[26px] w-[26px] bg-card text-[9px] tracking-normal"
                  style={{ borderWidth: 2, boxShadow: "none" }}
                >
                  完
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
