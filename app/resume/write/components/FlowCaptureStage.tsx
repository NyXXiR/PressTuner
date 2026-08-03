"use client";

import { useState } from "react";
import { ArrowRight, Check, Clock3, Loader2 } from "lucide-react";

import {
  selectPendingCaptures,
  type ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";

import { FlowCaptureCard } from "./FlowCaptureCard";
import { FlowDeferredCaptureTaskCard } from "./FlowDeferredCaptureTaskCard";
import type { FlowDispatch } from "./flowViewTypes";
import type { WriteFlowCommands } from "./useWriteFlow";

type FlowCaptureStageProps = {
  readonly state: ResumeWriteFlowState;
  readonly onAction: FlowDispatch;
  readonly commands: WriteFlowCommands;
};

export function FlowCaptureStage({ state, onAction, commands }: FlowCaptureStageProps) {
  const [finishing, setFinishing] = useState(false);
  const pendingCaptures = selectPendingCaptures(state);
  const deferredCount = state.questions.filter(
    (question) => question.deferredCapture,
  ).length;
  const appliedCount = state.captures.filter(
    (capture) => capture.status === "applied",
  ).length;

  const finish = async () => {
    setFinishing(true);
    try {
      await commands.finish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-4" aria-labelledby="flow-capture-title">
      <div className="max-w-2xl">
        <p className="mb-2 text-[11px] font-bold tracking-[0.18em] text-primary">
          마무리 · 경험 확인
        </p>
        <h1 id="flow-capture-title" className="text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl">
          {pendingCaptures.length > 0
            ? "아직 결정하지 않은 경험이 남아 있어요"
            : "경험 정리를 모두 마쳤어요"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          {pendingCaptures.length > 0
            ? "반영할 경험만 골라 승인하세요. 승인 전까지 경력 기억은 바뀌지 않습니다."
            : "바로 작성을 완료할 수 있습니다."}
        </p>
      </div>

      {appliedCount > 0 && (
        <p className="flex items-center gap-2 border border-primary/30 bg-primary/5 px-4 py-3 text-xs font-bold text-primary">
          <Check className="h-4 w-4" aria-hidden="true" />
          작성 중 경험 {appliedCount}건을 이미 경력 기억에 반영했어요.
        </p>
      )}

      {deferredCount > 0 && (
        <p className="flex items-start gap-2 bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          문항 {deferredCount}개는 경험 추출이 잠시 미뤄졌어요. 답변은 안전하게
          저장됐고, 나중에 다시 추출할 수 있습니다.
        </p>
      )}

      {state.finish.error && (
        <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs font-bold text-destructive">
          {state.finish.error}
        </p>
      )}

      {pendingCaptures.map((capture) => (
        <FlowCaptureCard
          key={capture.captureId}
          capture={capture}
          questionIndex={state.questions.findIndex(
            (question) => question.id === capture.questionId,
          )}
          onAction={onAction}
          onApply={() => void commands.applyCapture(capture.captureId)}
          onDismiss={() => void commands.dismissCapture(capture.captureId)}
        />
      ))}
      {state.deferredCaptures.map((task) => (
        <FlowDeferredCaptureTaskCard
          key={task.taskId}
          task={task}
          questionIndex={state.questions.findIndex(
            (question) => question.id === task.questionId,
          )}
          onRetry={(reopen) => void commands.retryCapture(task.taskId, reopen)}
        />
      ))}

      <footer className="flex flex-col gap-3 border-t-2 border-foreground pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          {pendingCaptures.length > 0
            ? "남은 경험을 반영하거나 보류하면 완료할 수 있습니다."
            : "완료하면 지원서가 완료 상태로 바뀌고 리캡을 보여드려요."}
        </p>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={
            pendingCaptures.length > 0 ||
            finishing ||
            state.finish.status === "pending"
          }
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {finishing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          )}
          {finishing ? "완료 처리 중" : "작성 완료하기"}
        </button>
      </footer>
    </section>
  );
}
