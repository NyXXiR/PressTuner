import { CheckCircle2, FileText, Layers3, RotateCcw } from "lucide-react";

import type { ResumeWritingLabState } from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

type LabDoneProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabDone({ state, onAction }: LabDoneProps) {
  const savedBricks = state.bricks.filter((brick) =>
    state.sessionSavedBrickIds.includes(brick.id),
  );

  return (
    <section className="mx-auto max-w-4xl" aria-labelledby="lab-done-title">
      <div className="text-center">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-success">
          Step 5 · 완료
        </p>
        <h1 id="lab-done-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          자기소개서 작성 플로우를 마쳤습니다
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {state.questions.length}개 문항을 생성·첨삭·완료했고, 이번 작성에서 얻은 경험 {savedBricks.length}개를 다음 지원서에 재사용할 상태로 만들었습니다.
        </p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="done-answer-title">
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="done-answer-title" className="text-sm font-bold">완료한 답변</h2>
          </div>
          <ul className="mt-4 space-y-3">
            {state.questions.map((question, index) => (
              <li key={question.id} className="rounded-xl bg-muted/60 p-4">
                <p className="text-xs font-bold text-primary">문항 {index + 1}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{question.prompt}</p>
                <p className="mt-2 text-[11px] font-bold text-success">{question.answer.length}자 · 완료</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="done-brick-title">
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <Layers3 className="h-5 w-5 text-ai" aria-hidden="true" />
            <h2 id="done-brick-title" className="text-sm font-bold">이번에 반영한 경험 브릭</h2>
          </div>
          {savedBricks.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {savedBricks.map((brick) => (
                <li key={brick.id} className="rounded-xl bg-ai-soft p-4">
                  <p className="text-sm font-bold">{brick.title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {brick.tags.map((tag) => `#${tag}`).join(" ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              이번 테스트에서는 저장할 경험을 선택하지 않았습니다.
            </p>
          )}
        </section>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => onAction({ type: "reset" })}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          새 지원서로 다시 테스트
        </button>
      </div>
    </section>
  );
}
