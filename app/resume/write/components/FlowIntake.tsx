"use client";

import { Link2, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import type { ResumeWriteFlowState } from "@/domain/resume-writing/flowMachine";

import type { FlowDispatch } from "./flowViewTypes";

type FlowIntakeProps = {
  readonly state: ResumeWriteFlowState;
  readonly onAction: FlowDispatch;
  readonly onOrganize: () => void;
};

export function FlowIntake({ state, onAction, onOrganize }: FlowIntakeProps) {
  const organizing = state.organize.status === "pending";
  const canOrganize =
    !organizing &&
    Boolean(state.intake.rawText.trim() || state.intake.postingUrl.trim());

  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="flow-intake-title">
      <div className="mb-7 max-w-2xl">
        <p className="mb-2 text-[11px] font-bold tracking-[0.18em] text-primary">
          준비 · 원문 입력
        </p>
        <h1
          id="flow-intake-title"
          className="text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl"
        >
          공고와 문항을 그대로 붙여넣으세요
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          형식은 맞추지 않아도 됩니다. 회사·직무·문항·글자 수를 정리해서
          저장하기 전에 먼저 보여드립니다.
        </p>
      </div>

      <label htmlFor="flow-rough-input" className="sr-only">
        채용 공고·문항 원문
      </label>
      <textarea
        id="flow-rough-input"
        value={state.intake.rawText}
        onChange={(event) =>
          onAction({
            type: "update_intake",
            field: "rawText",
            value: event.target.value,
          })
        }
        disabled={organizing}
        rows={13}
        placeholder={"주요 업무, 자격요건, 회사 소개, 자기소개서 문항을 한 번에 붙여넣으세요.\n문항 옆에 (700자)처럼 적혀 있으면 글자 수도 함께 정리됩니다."}
        className="wg-grid w-full resize-y border border-border bg-card px-6 py-5 text-sm leading-7 shadow-[0_18px_44px_rgba(30,40,30,0.07)] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1" htmlFor="flow-posting-url">
          <span className="sr-only">공고 URL (선택)</span>
          <Link2
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="flow-posting-url"
            value={state.intake.postingUrl}
            onChange={(event) =>
              onAction({
                type: "update_intake",
                field: "postingUrl",
                value: event.target.value,
              })
            }
            disabled={organizing}
            placeholder="공고 주소로 가져오기 (선택) — https://careers.example.com/job"
            className="h-12 w-full border border-input bg-card pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          onClick={onOrganize}
          disabled={!canOrganize}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {organizing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {organizing ? "정리하는 중" : "공고 정리하기"}
        </button>
      </div>

      {state.organize.status === "error" && state.organize.error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {state.organize.error}
        </p>
      )}

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {organizing
          ? "공고를 확인하고 문항을 정리하는 중입니다. 잠시만 기다려 주세요."
          : "정리 결과는 저장 전에 먼저 보여드려요. 원문은 자유롭게 고칠 수 있습니다."}
      </p>
    </section>
  );
}
