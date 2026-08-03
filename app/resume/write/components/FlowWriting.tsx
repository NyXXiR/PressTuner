"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";

import {
  selectCanFinishFromWriting,
  selectPendingCaptures,
  type ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";

import { FlowCaptureCard } from "./FlowCaptureCard";
import { FlowCommandBar } from "./FlowCommandBar";
import { FlowDraftEditor } from "./FlowDraftEditor";
import { FlowQuestionStrip } from "./FlowQuestionStrip";
import { FlowVerificationPanel } from "./FlowVerificationPanel";
import type { FlowDispatch } from "./flowViewTypes";
import type { WriteFlowCommands } from "./useWriteFlow";

type FlowWritingProps = {
  readonly state: ResumeWriteFlowState;
  readonly onAction: FlowDispatch;
  readonly commands: WriteFlowCommands;
};

function BriefDisclosure({ state }: { readonly state: ResumeWriteFlowState }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-end gap-1 pb-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        공고 브리핑
        <ChevronDown
          className="h-4 w-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <dl className="mb-3 grid gap-3 border border-border bg-card px-4 py-4 text-xs leading-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="font-bold text-foreground">핵심 요약</dt>
          <dd className="mt-1 text-muted-foreground">
            {state.brief.summary || "찾지 못했습니다."}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">고용 형태 · 근무지</dt>
          <dd className="mt-1 text-muted-foreground">
            {[state.brief.employmentType, state.brief.location]
              .filter(Boolean)
              .join(" · ") || "찾지 못했습니다."}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">핵심 신호</dt>
          <dd className="mt-1 text-muted-foreground">
            {state.brief.keySignals.join(" · ") || "찾지 못했습니다."}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-bold text-foreground">작성 가이드</dt>
          <dd className="mt-1 text-muted-foreground">
            {state.brief.writingGuidance.join(" · ") || "찾지 못했습니다."}
          </dd>
        </div>
      </dl>
    </details>
  );
}

export function FlowWriting({ state, onAction, commands }: FlowWritingProps) {
  const [finishing, setFinishing] = useState(false);
  const activeIndex = state.questions.findIndex(
    (question) => question.id === state.activeQuestionId,
  );
  const activeQuestion = activeIndex >= 0 ? state.questions[activeIndex] : null;
  const pendingCaptures = selectPendingCaptures(state);
  const allCompleted =
    state.questions.length > 0 &&
    state.questions.every((question) => question.status === "completed");
  const canFinish = selectCanFinishFromWriting(state);

  if (!activeQuestion) return null;

  const finish = async () => {
    setFinishing(true);
    try {
      await commands.finish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <section
      aria-labelledby="flow-writing-title"
      className="mx-auto w-full max-w-[820px]"
    >
      <h1 id="flow-writing-title" className="sr-only">
        자기소개서 작성과 첨삭
      </h1>

      <BriefDisclosure state={state} />
      <FlowQuestionStrip state={state} onAction={onAction} />
      <FlowDraftEditor
        state={state}
        question={activeQuestion}
        questionIndex={activeIndex}
        onAction={onAction}
        onSave={() => void commands.saveQuestion(activeQuestion.id)}
        onComplete={() => void commands.completeCurrentQuestion(activeQuestion.id)}
        onReopen={() => void commands.reopenQuestion(activeQuestion.id)}
        onRegenerate={() => void commands.regenerateDraft(activeQuestion.id)}
      />
      <FlowVerificationPanel
        question={activeQuestion}
        onOverride={(verificationId, reason) =>
          commands.overrideQuestion(activeQuestion.id, verificationId, reason)
        }
      />

      <div className="mt-4">
        <FlowCommandBar
          question={activeQuestion}
          onSendPrompt={(prompt) => void commands.sendPrompt(prompt)}
        />
      </div>

      {pendingCaptures.map((capture) => (
        <div key={capture.captureId} className="mt-4">
          <FlowCaptureCard
            capture={capture}
            questionIndex={state.questions.findIndex(
              (question) => question.id === capture.questionId,
            )}
            onAction={onAction}
            onApply={() => void commands.applyCapture(capture.captureId)}
            onDismiss={() => void commands.dismissCapture(capture.captureId)}
            animateIn
          />
        </div>
      ))}

      {allCompleted && (
        <div className="mt-6 flex flex-col gap-3 border-t-2 border-foreground pt-4 sm:flex-row sm:items-center sm:justify-between animate-flow-rise">
          {state.finish.error && (
            <p className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive sm:basis-full">
              {state.finish.error}
            </p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            <b className="text-foreground">모든 문항을 완료했어요.</b>{" "}
            {canFinish
              ? "이제 작성을 마칠 수 있습니다."
              : "위에서 발견한 경험의 반영 여부를 정하면 바로 마칠 수 있어요."}
          </p>
          {canFinish ? (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={finishing || state.finish.status === "pending"}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            >
              {finishing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              {finishing ? "완료 처리 중" : "작성 마치기"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAction({ type: "goto_capture" })}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 border border-border bg-card px-5 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              남은 경험 모아서 마무리
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
