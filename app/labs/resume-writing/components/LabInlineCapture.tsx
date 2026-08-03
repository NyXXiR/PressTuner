import { Layers3, Link2, Plus, X } from "lucide-react";

import type { ResumeWritingLabState } from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

type LabInlineCaptureProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabInlineCapture({ state, onAction }: LabInlineCaptureProps) {
  const candidate = state.inlineCandidate;
  if (!candidate) return null;

  const matchedBrick = state.bricks.find(
    (brick) => brick.id === candidate.matchedBrickId,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inline-capture-title"
        className="w-full max-w-2xl rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ai">경험 저장 후보</p>
            <h2 id="inline-capture-title" className="mt-2 text-xl font-bold">답변에서 새 경험을 찾았어요</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              지금 저장하면 이 문항에 바로 연결되고 다음 자기소개서에서도 다시 쓸 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAction({ type: "dismiss_inline_candidate" })}
            aria-label="경험 저장 후보 닫기"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="text-sm font-bold">{candidate.title}</h3>
            <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">{candidate.content}</p>
            <p className="mt-3 text-xs font-bold text-primary">
              {candidate.tags.map((tag) => `#${tag}`).join(" ")}
            </p>
          </div>

          {matchedBrick && (
            <div className="rounded-xl bg-muted/60 p-4">
              <p className="text-xs font-bold text-muted-foreground">비슷한 기존 경험</p>
              <p className="mt-1 text-sm font-bold">{matchedBrick.title}</p>
            </div>
          )}
        </div>

        <footer className="grid gap-2 border-t border-border bg-muted/40 p-4 sm:grid-cols-3 sm:p-5">
          <button
            type="button"
            onClick={() => onAction({ type: "save_inline_candidate", resolution: "create" })}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            새 브릭으로 저장
          </button>
          <button
            type="button"
            onClick={() => onAction({ type: "save_inline_candidate", resolution: "augment" })}
            disabled={!matchedBrick}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-bold hover:bg-muted disabled:opacity-40"
          >
            <Layers3 className="h-4 w-4" aria-hidden="true" />
            기존 경험 보강
          </button>
          <button
            type="button"
            onClick={() => onAction({ type: "save_inline_candidate", resolution: "link" })}
            disabled={!matchedBrick}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-bold hover:bg-muted disabled:opacity-40"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            연결만 하기
          </button>
        </footer>
      </section>
    </div>
  );
}
