import { ArrowLeft, BriefcaseBusiness, Plus, Sparkles, Trash2 } from "lucide-react";

import type { ResumeWritingLabState } from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

type LabReviewProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabReview({ state, onAction }: LabReviewProps) {
  const canContinue = Boolean(
    state.target.company.trim() &&
    state.target.role.trim() &&
    state.questions.some((question) => question.prompt.trim()),
  );

  return (
    <section className="mx-auto max-w-5xl" aria-labelledby="lab-review-title">
      <div className="mb-6 flex items-start gap-3">
        <button
          type="button"
          onClick={() => onAction({ type: "back_to_intake" })}
          aria-label="원문 입력으로 돌아가기"
          className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Step 2 · 정리본 확인
          </p>
          <h1 id="lab-review-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            이 내용대로 준비하면 될까요?
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            AI가 정리한 지원 정보와 문항을 짧게 확인하고, 틀린 부분만 바로 고쳐주세요.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="review-target-title">
            <div className="mb-4 flex items-center gap-2">
              <BriefcaseBusiness className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 id="review-target-title" className="text-sm font-bold">지원 정보</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReviewInput label="회사명" value={state.target.company} field="company" onAction={onAction} />
              <ReviewInput label="지원 직무" value={state.target.role} field="role" onAction={onAction} />
              <ReviewInput label="마감일" value={state.target.deadline} field="deadline" onAction={onAction} />
              <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                공고 핵심 요약
                <textarea
                  value={state.target.summary}
                  onChange={(event) => onAction({ type: "update_target", field: "summary", value: event.target.value })}
                  rows={4}
                  className="resize-y rounded-xl border border-input bg-background px-4 py-3 font-normal leading-6 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="review-question-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="review-question-title" className="text-sm font-bold">자기소개서 문항</h2>
                <p className="mt-1 text-xs text-muted-foreground">필요한 문항만 남기고 문구와 글자 수를 수정할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => onAction({ type: "add_question" })}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                문항 추가
              </button>
            </div>
            <div className="space-y-3">
              {state.questions.map((question, index) => (
                <div key={question.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold text-primary">문항 {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => onAction({ type: "remove_question", questionId: question.id })}
                      disabled={state.questions.length === 1}
                      aria-label={`문항 ${index + 1} 삭제`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <textarea
                    aria-label={`문항 ${index + 1} 내용`}
                    value={question.prompt}
                    onChange={(event) => onAction({ type: "update_question_prompt", questionId: question.id, value: event.target.value })}
                    rows={2}
                    className="w-full resize-y bg-transparent text-sm font-semibold leading-6 outline-none"
                  />
                  <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    글자 수
                    <input
                      type="number"
                      min={100}
                      max={3000}
                      step={50}
                      value={question.charLimit}
                      onChange={(event) => onAction({ type: "update_question_limit", questionId: question.id, value: Number(event.target.value) })}
                      className="h-9 w-24 rounded-lg border border-input bg-card px-3 text-foreground outline-none focus:border-primary"
                    />
                    자
                  </label>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold">AI가 함께 참고할 내용</h2>
            <dl className="mt-4 space-y-4 text-xs leading-5">
              <ReviewDetail label="고용 형태" value={state.target.employmentType} />
              <ReviewDetail label="근무지" value={state.target.location} />
              <ReviewDetail label="핵심 신호" value={state.target.keySignals.join(" · ")} />
              <ReviewDetail label="작성 가이드" value={state.target.writingGuidance.join(" · ")} />
            </dl>
          </section>

          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-xs font-bold text-primary">재사용 경험 {state.bricks.length}개 준비됨</p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {state.bricks.map((brick) => <li key={brick.id}>• {brick.title}</li>)}
            </ul>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              확인 후 각 문항에 적합한 경험을 연결한 샘플 초안을 한 번에 만듭니다.
            </p>
          </section>

          <button
            type="button"
            onClick={() => onAction({ type: "confirm_review" })}
            disabled={!canContinue}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            확인하고 전체 초안 만들기
          </button>
        </aside>
      </div>
    </section>
  );
}

type ReviewInputProps = {
  readonly label: string;
  readonly value: string;
  readonly field: "company" | "role" | "deadline";
  readonly onAction: LabDispatch;
};

function ReviewInput({ label, value, field, onAction }: ReviewInputProps) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      {label}
      <input
        value={value}
        onChange={(event) => onAction({ type: "update_target", field, value: event.target.value })}
        className="h-12 rounded-xl border border-input bg-background px-4 font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function ReviewDetail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="font-bold text-foreground">{label}</dt>
      <dd className="mt-1 text-muted-foreground">{value || "찾지 못했습니다."}</dd>
    </div>
  );
}
