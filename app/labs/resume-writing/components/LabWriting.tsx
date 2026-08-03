import { useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";

import type { ResumeWritingLabState } from "@/domain/resume-writing/labMachine";

import { LabAssistantPanel } from "./LabAssistantPanel";
import { LabBrickLinks } from "./LabBrickLinks";
import { LabDraftEditor } from "./LabDraftEditor";
import { LabInlineCapture } from "./LabInlineCapture";
import { LabQuestionNav } from "./LabQuestionNav";
import type { LabDispatch } from "./labViewTypes";

type LabWritingProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabWriting({ state, onAction }: LabWritingProps) {
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false);
  const activeIndex = state.questions.findIndex(
    (question) => question.id === state.activeQuestionId,
  );
  const activeQuestion = activeIndex >= 0 ? state.questions[activeIndex] : null;
  const completedCount = state.questions.filter(
    (question) => question.status === "completed",
  ).length;
  const allCompleted = completedCount === state.questions.length;

  if (!activeQuestion) return null;

  return (
    <section aria-labelledby="lab-writing-title">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Step 3 · 작성과 첨삭
          </p>
          <h1 id="lab-writing-title" className="text-2xl font-bold sm:text-3xl">
            초안을 읽고, 대화로 고쳐나가세요
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            문항 완료 {completedCount}/{state.questions.length} · 브라우저에 자동 저장 중
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAssistantOpen((open) => !open)}
            className="hidden h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-bold transition-colors hover:bg-muted xl:inline-flex"
          >
            {assistantOpen ? <PanelRightClose className="h-4 w-4" aria-hidden="true" /> : <PanelRightOpen className="h-4 w-4" aria-hidden="true" />}
            {assistantOpen ? "AI 패널 접기" : "AI 패널 열기"}
          </button>
          {allCompleted && (
            <button
              type="button"
              onClick={() => onAction({ type: "complete_application" })}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-bold text-success-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              전체 완료하고 경험 추출
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-4 ${assistantOpen ? "xl:grid-cols-[220px_minmax(0,1fr)_320px]" : "xl:grid-cols-[220px_minmax(0,1fr)]"}`}>
        <div className="space-y-4">
          <LabQuestionNav state={state} onAction={onAction} />
          <LabBrickLinks state={state} question={activeQuestion} onAction={onAction} />
        </div>
        <LabDraftEditor
          question={activeQuestion}
          previousQuestionId={state.questions[activeIndex - 1]?.id ?? null}
          nextQuestionId={state.questions[activeIndex + 1]?.id ?? null}
          onAction={onAction}
        />
        {assistantOpen && (
          <div className="hidden xl:block">
            <LabAssistantPanel question={activeQuestion} onAction={onAction} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMobileAssistantOpen(true)}
        aria-label="AI 첨삭 도우미 열기"
        className="fixed bottom-5 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-[1.03] active:scale-[0.98] xl:hidden"
      >
        <Bot className="h-6 w-6" aria-hidden="true" />
      </button>

      {mobileAssistantOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-foreground/35 backdrop-blur-sm xl:hidden">
          <div className="relative max-h-[88dvh] w-full rounded-t-2xl bg-card p-3 shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileAssistantOpen(false)}
              aria-label="AI 첨삭 도우미 닫기"
              className="absolute right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <LabAssistantPanel question={activeQuestion} onAction={onAction} />
          </div>
        </div>
      )}

      <LabInlineCapture state={state} onAction={onAction} />
    </section>
  );
}
