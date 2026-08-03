"use client";

import Link from "next/link";
import {
  Check,
  Loader2,
  PencilLine,
  RefreshCcw,
  RotateCcw,
  Save,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import type {
  FlowQuestion,
  FlowQuestionStatus,
  ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";

import { FlowBrickChips } from "./FlowBrickChips";
import { FlowSuggestionCompare } from "./FlowSuggestionCompare";
import type { FlowDispatch } from "./flowViewTypes";

const STATUS_LABEL = {
  ready: "초안 전",
  drafted: "AI 초안",
  revised: "수정 중",
  saved: "임시저장",
  completed: "문항 완료",
} satisfies Record<FlowQuestionStatus, string>;

type FlowDraftEditorProps = {
  readonly state: ResumeWriteFlowState;
  readonly question: FlowQuestion;
  readonly questionIndex: number;
  readonly onAction: FlowDispatch;
  readonly onSave: () => void;
  readonly onComplete: () => void;
  readonly onReopen: () => void;
  readonly onRegenerate: () => void;
};

export function FlowDraftEditor({
  state,
  question,
  questionIndex,
  onAction,
  onSave,
  onComplete,
  onReopen,
  onRegenerate,
}: FlowDraftEditorProps) {
  const completed = question.status === "completed";
  const generating = question.draftStatus === "generating";
  const hasAnswer = Boolean(question.answer.trim());
  const busy = question.saving || generating;

  return (
    <article className="flex min-h-[520px] flex-col overflow-hidden border border-border bg-card shadow-[0_18px_44px_rgba(30,40,30,0.08)]">
      <header className="space-y-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
              Q{questionIndex + 1} · {question.charLimit}자
              {question.linkedBrickIds.length > 0 &&
                ` · 경험 ${question.linkedBrickIds.length}개 연결`}
            </p>
            <h2 className="mt-2 text-lg font-bold leading-relaxed tracking-tight sm:text-xl">
              {question.prompt}
            </h2>
          </div>
          <span
            className={`shrink-0 border px-2.5 py-1 text-[11px] font-bold ${
              completed
                ? "border-primary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {generating ? "초안 생성 중" : STATUS_LABEL[question.status]}
          </span>
        </div>
        {question.aiAdvice && !completed && (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-ai">
            <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {question.aiAdvice}
          </p>
        )}
        <FlowBrickChips state={state} question={question} onAction={onAction} />
      </header>

      {question.pendingSuggestion ? (
        <FlowSuggestionCompare question={question} onAction={onAction} />
      ) : generating ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center bg-ai-soft text-ai">
            <Sparkles className="h-6 w-6 animate-pulse" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold">연결된 경험으로 초안을 만들고 있어요</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              먼저 완성된 다른 문항부터 읽고 있어도 됩니다. 끝나면 이 자리에 초안이 나타나요.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4 sm:p-6">
          {question.draftStatus === "error" && question.draftError && (
            <div
              role="alert"
              className="mb-4 flex flex-col gap-2.5 border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2">
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <p className="text-xs leading-5 text-destructive">
                  {question.draftError}
                  <span className="mt-0.5 block text-muted-foreground">
                    초안 없이도 아래에 직접 작성하고 완료할 수 있어요.
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-border bg-card px-3 text-xs font-bold transition-colors hover:bg-muted"
              >
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                다시 시도
              </button>
              {(state.memoryReadiness?.status !== "READY" ||
                state.userBricks.length === 0) && (
                <Link
                  href="/resume/bricks"
                  className="inline-flex h-9 shrink-0 items-center justify-center border border-primary px-3 text-xs font-bold text-primary"
                >
                  경력 기억 준비하기
                </Link>
              )}
            </div>
          )}
          <textarea
            aria-label={completed ? "자기소개서 답변 (완료됨)" : "자기소개서 답변"}
            value={question.answer}
            onChange={(event) => onAction({ type: "update_answer", value: event.target.value })}
            readOnly={completed}
            placeholder={
              question.draftStatus === "error"
                ? "초안 없이 직접 써 내려갈 수 있습니다."
                : "초안이 이곳에 생성됩니다. 직접 써 내려가도 됩니다."
            }
            className="wg-ruled min-h-[360px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 read-only:cursor-default sm:text-[15.5px]"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {question.saveError ? (
              <p role="alert" className="text-xs font-semibold text-destructive">
                {question.saveError}
              </p>
            ) : (
              <span />
            )}
            <CharProgress length={question.answer.length} limit={question.charLimit} />
          </div>
        </div>
      )}

      {!question.pendingSuggestion && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/50 p-3 sm:px-6">
          {!completed && hasAnswer && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy}
              className="mr-auto inline-flex h-10 items-center justify-center gap-1.5 border border-ai/30 bg-ai/10 px-3 text-xs font-bold text-foreground transition-colors hover:bg-ai/15 disabled:opacity-40"
            >
              <RefreshCcw className="h-4 w-4 text-ai" aria-hidden="true" />
              초안 다시 만들기
            </button>
          )}
          {completed ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={question.saving}
                className="inline-flex h-10 items-center justify-center gap-1.5 border border-border bg-background px-4 text-xs font-bold transition-colors hover:bg-muted disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              수정 다시 열기
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={!hasAnswer || busy}
              className="inline-flex h-10 items-center justify-center gap-1.5 border border-border bg-background px-4 text-xs font-bold transition-colors hover:bg-muted disabled:opacity-40"
              >
                {question.saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                임시저장
              </button>
              <button
                type="button"
                onClick={onComplete}
                disabled={!hasAnswer || busy}
                className="inline-flex h-10 items-center justify-center gap-1.5 bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {question.saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                이 문항 완료
              </button>
            </>
          )}
        </footer>
      )}
    </article>
  );
}

function CharProgress({
  length,
  limit,
}: {
  readonly length: number;
  readonly limit: number;
}) {
  const overLimit = length > limit;
  const percent = Math.min(
    100,
    Math.round((length / Math.max(limit, 1)) * 100),
  );
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="글자 수 진행률"
        className="hidden h-1 w-32 overflow-hidden bg-border/70 sm:block"
      >
        <span
          className={`block h-full transition-[width] duration-200 ease-out ${
            overLimit ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span
        className={`font-mono text-xs font-bold tabular-nums ${
          overLimit ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {length} / {limit}자{overLimit ? " · 초과" : ` · ${percent}%`}
      </span>
    </span>
  );
}
