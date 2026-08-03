import { ArrowRight, Layers3, Sparkles } from "lucide-react";

import type { ResumeWritingLabState } from "@/domain/resume-writing/labMachine";
import { LabCandidateResolutionSchema } from "@/domain/resume-writing/labTypes";

import type { LabDispatch } from "./labViewTypes";

type LabCaptureProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabCapture({ state, onAction }: LabCaptureProps) {
  const selectedCount = state.captureCandidates.filter(
    (candidate) => candidate.resolution !== "skip",
  ).length;

  return (
    <section className="mx-auto max-w-4xl" aria-labelledby="lab-capture-title">
      <div className="mb-6 max-w-2xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-ai">
          Step 4 · 경험 자산화
        </p>
        <h1 id="lab-capture-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          완성한 답변에서 재사용할 경험을 찾았어요
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          새 브릭으로 만들지, 기존 경험을 보강할지, 연결만 할지 선택하세요. 이 선택도 로컬 상태에서만 동작합니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border bg-ai-soft p-5 text-ai sm:p-6">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-bold">
            후보 {state.captureCandidates.length}개 · 반영 {selectedCount}개
          </p>
        </div>
        <div className="grid gap-4 p-4 sm:p-6">
          {state.captureCandidates.map((candidate, index) => {
            const matchedBrick = state.bricks.find(
              (brick) => brick.id === candidate.matchedBrickId,
            );
            return (
              <article key={candidate.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Layers3 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-primary">문항 {index + 1}에서 발견</p>
                    <h2 className="mt-1 text-sm font-bold">{candidate.title}</h2>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {candidate.content}
                    </p>
                    <p className="mt-3 text-[11px] font-bold text-muted-foreground">
                      {candidate.tags.map((tag) => `#${tag}`).join(" ")}
                    </p>
                  </div>
                </div>

                {matchedBrick && (
                  <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    비슷한 기존 경험: <strong className="text-foreground">{matchedBrick.title}</strong>
                  </p>
                )}

                <label className="mt-4 grid gap-2 text-xs font-bold">
                  처리 방식
                  <select
                    value={candidate.resolution}
                    onChange={(event) => onAction({
                      type: "set_candidate_resolution",
                      candidateId: candidate.id,
                      resolution: LabCandidateResolutionSchema.parse(event.target.value),
                    })}
                    className="h-11 rounded-xl border border-input bg-card px-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="create">새 경험으로 저장</option>
                    <option value="augment" disabled={!matchedBrick}>기존 경험 보강</option>
                    <option value="link" disabled={!matchedBrick}>기존 경험 연결만</option>
                    <option value="skip">이번에는 건너뛰기</option>
                  </select>
                </label>
              </article>
            );
          })}
        </div>
        <footer className="flex flex-col gap-3 border-t border-border bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-xs leading-5 text-muted-foreground">
            건너뛴 후보는 저장하지 않습니다. 나머지는 완료와 동시에 경험 보관함 상태에 반영됩니다.
          </p>
          <button
            type="button"
            onClick={() => onAction({ type: "save_candidates" })}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            선택대로 반영하고 완료
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </footer>
      </div>
    </section>
  );
}
