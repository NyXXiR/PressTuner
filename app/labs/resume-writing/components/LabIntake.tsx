import { FileText, Link2, Sparkles } from "lucide-react";

import { SAMPLE_RAW_INPUT } from "@/domain/resume-writing/labFixtures";
import type { ResumeWritingLabState } from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

type LabIntakeProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabIntake({ state, onAction }: LabIntakeProps) {
  const canOrganize = Boolean(
    state.intake.rawText.trim() || state.intake.postingUrl.trim(),
  );

  const loadSample = () => {
    onAction({ type: "update_intake", field: "rawText", value: SAMPLE_RAW_INPUT });
    onAction({ type: "update_intake", field: "postingUrl", value: "" });
  };

  return (
    <section className="mx-auto max-w-4xl" aria-labelledby="lab-intake-title">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Step 1 · 원문 입력
          </p>
          <h1 id="lab-intake-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            공고와 자소서 문항을 그대로 붙여넣으세요
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            형식을 맞출 필요 없습니다. 대충 붙여넣으면 다음 화면에서 회사·직무·문항으로 정리된 결과를 먼저 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSample}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          샘플 다시 불러오기
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            <label htmlFor="lab-rough-input" className="text-sm font-bold">
              채용 공고·문항 원문
            </label>
          </div>
          <textarea
            id="lab-rough-input"
            value={state.intake.rawText}
            onChange={(event) => onAction({
              type: "update_intake",
              field: "rawText",
              value: event.target.value,
            })}
            rows={16}
            placeholder={"주요 업무, 자격요건, 회사 소개, 자기소개서 문항을 한 번에 붙여넣으세요.\n문항 옆에 (700자)처럼 적혀 있으면 글자 수도 함께 정리됩니다."}
            className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm leading-7 outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          <label className="grid gap-2 text-sm font-bold" htmlFor="lab-posting-url">
            공고 URL <span className="font-normal text-muted-foreground">(선택)</span>
            <span className="relative">
              <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="lab-posting-url"
                value={state.intake.postingUrl}
                onChange={(event) => onAction({
                  type: "update_intake",
                  field: "postingUrl",
                  value: event.target.value,
                })}
                placeholder="https://careers.example.com/job"
                className="h-12 w-full rounded-xl border border-input bg-background pl-11 pr-4 font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </span>
          </label>

          <div className="flex flex-col gap-3 rounded-xl bg-ai-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              이 랩은 실제 AI나 서버를 호출하지 않고, 샘플 정리 결과와 브라우저 상태만 사용합니다.
            </p>
            <button
              type="button"
              onClick={() => onAction({ type: "organize_intake" })}
              disabled={!canOrganize}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-ai px-5 text-sm font-bold text-ai-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              AI로 공고 정리
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
