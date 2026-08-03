"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Layers3,
  Loader2,
  PencilLine,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import {
  selectCanConfirmReview,
  type ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";

import type { FlowDispatch } from "./flowViewTypes";

type FlowReviewProps = {
  readonly state: ResumeWriteFlowState;
  readonly onAction: FlowDispatch;
  readonly onStart: () => void;
};

export function FlowReview({ state, onAction, onStart }: FlowReviewProps) {
  const starting = state.start.status === "pending";
  const canContinue = selectCanConfirmReview(state) && !starting;

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="flow-review-title">
      <div className="mb-6 flex items-start gap-3">
        <button
          type="button"
          onClick={() => onAction({ type: "back_to_intake" })}
          disabled={starting}
          aria-label="원문 입력으로 돌아가기"
          className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[11px] font-bold tracking-[0.18em] text-primary">
            준비 · 정리 확인
          </p>
          <h1 id="flow-review-title" className="sr-only">
            정리된 지원 정보 확인
          </h1>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <input
              aria-label="회사명"
              value={state.company}
              onChange={(event) =>
                onAction({
                  type: "update_target",
                  field: "company",
                  value: event.target.value,
                })
              }
              disabled={starting}
              placeholder="회사명"
              size={Math.max(state.company.length, 4)}
              className="max-w-full border-b border-transparent bg-transparent pb-1 text-3xl font-extrabold tracking-tight outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary sm:text-4xl disabled:opacity-60"
            />
            <input
              aria-label="지원 직무"
              value={state.job}
              onChange={(event) =>
                onAction({
                  type: "update_target",
                  field: "job",
                  value: event.target.value,
                })
              }
              disabled={starting}
              placeholder="지원 직무"
              size={Math.max(state.job.length, 6)}
              className="max-w-full border-b border-transparent bg-transparent pb-1 text-lg text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary sm:text-xl disabled:opacity-60"
            />
          </div>
          <label className="mt-3 block">
            <span className="sr-only">공고 핵심 요약</span>
            <textarea
              value={state.brief.summary}
              onChange={(event) =>
                onAction({
                  type: "update_target",
                  field: "summary",
                  value: event.target.value,
                })
              }
              disabled={starting}
              rows={3}
              placeholder="공고 핵심 요약"
              className="w-full resize-y border border-transparent bg-transparent text-sm leading-6 text-muted-foreground outline-none transition-colors [field-sizing:content] placeholder:text-muted-foreground/40 focus:border-input focus:bg-card focus:px-3 focus:py-2 disabled:opacity-60"
            />
          </label>

          <details className="group mt-1">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-primary transition-colors hover:opacity-80 [&::-webkit-details-marker]:hidden">
              공고 브리핑 전체 보기
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <dl className="mt-2 grid gap-3 border border-border bg-card p-4 text-xs leading-5 sm:grid-cols-2">
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
        </div>
      </div>

      <div className="space-y-4 pb-24">
        <section aria-labelledby="review-question-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="review-question-title" className="text-sm font-bold">
              자기소개서 문항 {state.questions.length}개
            </h2>
            <button
              type="button"
              onClick={() => onAction({ type: "add_question" })}
              disabled={starting}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 border border-border bg-card px-3 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              문항 추가
            </button>
          </div>
          <ol className="space-y-2.5">
            {state.questions.map((question, index) => (
              <li
                key={question.id}
                className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-4 border border-border bg-card p-4 sm:p-5"
              >
                <span
                  className="pt-0.5 font-mono text-lg font-bold leading-relaxed tabular-nums text-primary"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <textarea
                    aria-label={`문항 ${index + 1} 내용`}
                    value={question.prompt}
                    onChange={(event) =>
                      onAction({
                        type: "update_question_prompt",
                        questionId: question.id,
                        value: event.target.value,
                      })
                    }
                    disabled={starting}
                    rows={2}
                    placeholder="문항 내용을 입력하세요."
                    className="w-full resize-y bg-transparent text-sm font-semibold leading-6 outline-none placeholder:text-muted-foreground/40 disabled:opacity-60"
                  />
                  <label className="mt-2 flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                    글자 수
                    <input
                      type="number"
                      min={100}
                      max={3000}
                      step={50}
                      value={question.charLimit}
                      onChange={(event) =>
                        onAction({
                          type: "update_question_limit",
                          questionId: question.id,
                          value: Number(event.target.value),
                        })
                      }
                      disabled={starting}
                      className="h-8 w-24 border border-input bg-background px-2.5 text-foreground outline-none focus:border-primary disabled:opacity-60"
                    />
                    자
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onAction({ type: "remove_question", questionId: question.id })
                  }
                  disabled={starting || state.questions.length === 1}
                  aria-label={`문항 ${index + 1} 삭제`}
                  className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="border-[1.5px] border-dashed border-ai bg-ai-soft/60 p-4"
          aria-labelledby="review-direction-title"
        >
          <h2
            id="review-direction-title"
            className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-ai"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            작성 디렉션 (선택)
          </h2>
          <textarea
            value={state.direction}
            onChange={(event) =>
              onAction({ type: "update_direction", value: event.target.value })
            }
            disabled={starting}
            rows={2}
            placeholder={"예: 수치를 앞세워 담백하게 써줘. 리더 경험보다 실무 기여 위주로."}
            className="mt-2.5 w-full resize-y border border-input bg-card px-3.5 py-2.5 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            모든 문항의 초안에 함께 반영됩니다. 문항별 방향은 초안이 생긴 뒤 대화로 조정하세요.
          </p>
        </section>

        <section
          aria-labelledby="review-brick-title"
          className="flex items-start gap-3 border border-border bg-card px-4 py-3.5"
        >
          <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {state.userBricks.length > 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <b id="review-brick-title" className="text-foreground">
                경력 기억 {state.userBricks.length}개 준비됨
              </b>{" "}
              — 문항마다 어울리는 경험을 AI가 골라 연결합니다. 작성 화면에서
              문항별로 재료를 자유롭게 바꿀 수 있어요.
            </p>
          ) : (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-muted-foreground">
                <b id="review-brick-title" className="text-foreground">
                  아직 경력 기억이 없습니다
                </b>{" "}
                — 직접 작성은 계속할 수 있고, 경력 기억을 준비하면 근거 있는 AI
                초안을 만들 수 있어요.
              </p>
              <Link
                href="/resume/bricks"
                className="inline-flex h-9 items-center justify-center border border-primary px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                경력 기억 준비하기
              </Link>
            </div>
          )}
        </section>

        {state.start.status === "error" && state.start.error && (
          <p
            role="alert"
            className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {state.start.error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t-2 border-foreground bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            {starting
              ? "지원서를 만들고 문항별 경험을 연결하고 있어요. 곧 작성 화면으로 이동합니다."
              : "시작하면 첫 문항의 초안부터 차례로 만들어집니다."}
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={!canContinue}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
            {starting ? "작업대를 준비하는 중" : "이 문항들로 초안 만들기"}
          </button>
        </div>
      </div>
    </section>
  );
}
