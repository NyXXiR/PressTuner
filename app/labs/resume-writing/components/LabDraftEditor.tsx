import {
  ArrowLeft,
  ArrowRight,
  Check,
  FilePlus2,
  RotateCcw,
  Save,
} from "lucide-react";

import type {
  LabQuestion,
  LabQuestionStatus,
} from "@/domain/resume-writing/labMachine";

import { LabSuggestionCompare } from "./LabSuggestionCompare";
import type { LabDispatch } from "./labViewTypes";

const STATUS_LABEL = {
  ready: "초안 전",
  drafted: "AI 초안",
  revised: "수정 중",
  saved: "임시저장",
  completed: "문항 완료",
} satisfies Record<LabQuestionStatus, string>;

type LabDraftEditorProps = {
  readonly question: LabQuestion;
  readonly previousQuestionId: string | null;
  readonly nextQuestionId: string | null;
  readonly onAction: LabDispatch;
};

export function LabDraftEditor({
  question,
  previousQuestionId,
  nextQuestionId,
  onAction,
}: LabDraftEditorProps) {
  const completed = question.status === "completed";
  const hasAnswer = Boolean(question.answer.trim());
  const overLimit = question.answer.length > question.charLimit;

  return (
    <article className="flex min-h-[650px] min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-[0_24px_80px_rgba(12,18,28,0.12)] ring-1 ring-primary/10">
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {question.pendingSuggestion ? "AI 수정안 비교" : "Draft editor"}
            </p>
            <h2 className="mt-2 text-base font-bold leading-6">{question.prompt}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${completed ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
            {STATUS_LABEL[question.status]}
          </span>
        </div>
      </header>

      {question.pendingSuggestion ? (
        <LabSuggestionCompare question={question} onAction={onAction} />
      ) : (
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <textarea
            aria-label="자기소개서 답변"
            value={question.answer}
            onChange={(event) => onAction({ type: "update_answer", value: event.target.value })}
            readOnly={completed}
            placeholder="정리본 확인 후 모든 문항의 샘플 초안이 이곳에 생성됩니다."
            className="min-h-[430px] flex-1 resize-none bg-transparent text-sm leading-8 outline-none placeholder:text-muted-foreground/50 read-only:cursor-default sm:text-base"
          />

          <div className="mt-3 flex items-center justify-end">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${overLimit ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              {question.answer.length} / {question.charLimit}자
            </span>
          </div>
        </div>
      )}

      {!question.pendingSuggestion && (
        <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border bg-muted/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2">
            <QuestionMoveButton direction="previous" questionId={previousQuestionId} onAction={onAction} />
            <QuestionMoveButton direction="next" questionId={nextQuestionId} onAction={onAction} />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onAction({ type: "extract_active_experience" })}
              disabled={!hasAnswer}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-ai/30 bg-ai/10 px-3 text-xs font-bold text-foreground transition-colors hover:bg-ai/15 disabled:opacity-40"
            >
              <FilePlus2 className="h-4 w-4 text-ai" aria-hidden="true" />
              경험 저장 후보
            </button>
            {completed ? (
              <button
                type="button"
                onClick={() => onAction({ type: "reopen_question", questionId: question.id })}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 text-xs font-bold text-background transition-opacity hover:opacity-90"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                수정 재개
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onAction({ type: "save_question" })}
                  disabled={!hasAnswer}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 text-xs font-bold transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  임시저장
                </button>
                <button
                  type="button"
                  onClick={() => onAction({ type: "complete_question" })}
                  disabled={!hasAnswer}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  완료 처리
                </button>
              </>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}

function QuestionMoveButton({
  direction,
  questionId,
  onAction,
}: {
  readonly direction: "previous" | "next";
  readonly questionId: string | null;
  readonly onAction: LabDispatch;
}) {
  const Icon = direction === "previous" ? ArrowLeft : ArrowRight;
  const label = direction === "previous" ? "이전 문항" : "다음 문항";
  return (
    <button
      type="button"
      onClick={() => questionId && onAction({ type: "select_question", questionId })}
      disabled={!questionId}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-30"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
