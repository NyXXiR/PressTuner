"use client";

import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, FileText, Layers3, RotateCcw } from "lucide-react";

import type { ResumeWriteFlowState } from "@/domain/resume-writing/flowMachine";
import { FlowDeferredCaptureTaskCard } from "./FlowDeferredCaptureTaskCard";
import type { WriteFlowCommands } from "./useWriteFlow";

type FlowDoneProps = {
  readonly state: ResumeWriteFlowState;
  readonly onReset: () => void;
  readonly commands: WriteFlowCommands;
};

const WALL_MAX_CELLS = 28;

function BrickWall({
  start,
  end,
}: {
  readonly start: number;
  readonly end: number;
}) {
  const total = Math.min(end + 2, WALL_MAX_CELLS);
  const filled = Math.min(start, total);
  const fresh = Math.min(end, total) - filled;
  return (
    <div>
      <div
        className="mx-auto flex max-w-[420px] flex-wrap justify-center gap-1"
        aria-label={`경력 기억 ${start}개에서 ${end}개로 증가`}
      >
        {Array.from({ length: total }, (_, index) => {
          const isFilled = index < filled;
          const isFresh = !isFilled && index < filled + fresh;
          return (
            <i
              key={index}
              className={`h-5 w-5 border-[1.5px] border-primary ${
                isFilled
                  ? "bg-primary"
                  : isFresh
                    ? "bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.28)]"
                    : ""
              }`}
            />
          );
        })}
      </div>
      <p className="mt-3 text-center font-mono text-sm tabular-nums text-muted-foreground">
        경력 기억 {start} → <b className="text-primary">{end}</b>
      </p>
    </div>
  );
}

export function FlowDone({ state, onReset, commands }: FlowDoneProps) {
  const appliedCaptures = state.captures.filter(
    (capture) => capture.status === "applied",
  );
  const productivity = state.productivity;
  const brickEnd = productivity?.availableBrickCount ?? null;
  const brickGrowth = productivity?.capturedFromWritingCount ?? 0;
  const brickStart =
    brickEnd === null ? null : Math.max(0, brickEnd - brickGrowth);

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="flow-done-title">
      <div className="text-center">
        <span aria-label="작성 완료" className="mx-auto grid h-[92px] w-[92px] place-items-center border-2 border-primary text-primary">
          <Check className="h-12 w-12" strokeWidth={2.25} />
        </span>
        <h1
          id="flow-done-title"
          className="mt-7 text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          {state.company} 자기소개서를 완성했습니다
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          문항 {state.questions.length}개 완료 · 이번 작성으로 경험 자산이 함께 자랐습니다.
        </p>
      </div>

      {productivity && brickStart !== null && brickEnd !== null && (
        <div className="mt-8 animate-flow-rise">
          <BrickWall start={brickStart} end={brickEnd} />
          <div className="mt-6 flex justify-center gap-10 sm:gap-14">
            <RecapStat label="문항 완료" value={state.questions.length} />
            <RecapStat label="새로 추출" value={productivity.capturedFromWritingCount} signed />
            <RecapStat label="경험 재사용" value={productivity.reusedBrickCount} />
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section
          className="border border-border bg-card p-5"
          aria-labelledby="done-answer-title"
        >
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="done-answer-title" className="text-sm font-bold">완료한 답변</h2>
          </div>
          <ul className="mt-4 space-y-2.5">
            {state.questions.map((question, index) => (
              <li key={question.id} className="border border-border/70 bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs font-bold text-primary">
                    Q{index + 1}
                  </p>
                  <p className="inline-flex items-center gap-1 font-mono text-[11px] font-bold tabular-nums text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {question.answer.length}자
                  </p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {question.prompt}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="border border-border bg-card p-5"
          aria-labelledby="done-brick-title"
        >
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <Layers3 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="done-brick-title" className="text-sm font-bold">이번에 반영한 경험</h2>
          </div>
          {appliedCaptures.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {appliedCaptures.flatMap((capture) =>
                capture.items
                  .filter((item) => capture.selectedPreviewIds.includes(item.previewId))
                  .map((item) => (
                    <li
                      key={`${capture.captureId}-${item.previewId}`}
                      className="border border-primary/30 bg-primary/5 p-4"
                    >
                      <p className="text-sm font-bold">{item.title}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {item.tags.map((tag) => `#${tag}`).join(" ")}
                      </p>
                    </li>
                  )),
              )}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              이번 작성에서는 새로 반영한 경험이 없습니다. 완료한 답변은 언제든 경험으로
              다시 추출할 수 있어요.
            </p>
          )}
        </section>
      </div>

      {state.deferredCaptures.length > 0 && (
        <div className="mt-6 space-y-3">
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
        </div>
      )}

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/resume/applications"
          className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          지원서 보관함에서 확인
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-12 items-center justify-center gap-2 border border-border bg-card px-5 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          새 지원서 시작하기
        </button>
      </div>
    </section>
  );
}

function RecapStat({
  label,
  value,
  signed = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly signed?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="font-mono text-2xl font-extrabold tabular-nums">
        {signed && value > 0 ? `+${value}` : value}
      </p>
      <p className="mt-1 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
