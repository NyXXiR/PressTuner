"use client";

import { Link2, Loader2, Sparkles } from "lucide-react";

type IntakeInputPanelProps = {
  readonly isTutorial?: boolean;
  readonly rawText: string;
  readonly urlInput: string;
  readonly isParsingIntake: boolean;
  readonly hasIntakeResult: boolean;
  readonly error: string | null;
  readonly onRawTextChange: (value: string) => void;
  readonly onUrlInputChange: (value: string) => void;
  readonly onParse: () => void;
  readonly onUseExistingResult: () => void;
};

export function IntakeInputPanel({
  isTutorial = false,
  rawText,
  urlInput,
  isParsingIntake,
  hasIntakeResult,
  error,
  onRawTextChange,
  onUrlInputChange,
  onParse,
  onUseExistingResult,
}: IntakeInputPanelProps) {
  return (
    <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
      {isTutorial ? (
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            공고와 자소서 문항을 붙여넣으세요.
          </h1>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            샘플로 흐름 체험 중
          </div>
        </div>
      ) : null}

      <div className="space-y-4 pb-20">
        <textarea
          value={rawText}
          onChange={(event) => onRawTextChange(event.target.value)}
          placeholder={
            "채용 공고와 자기소개서 문항을 그대로 붙여넣으세요.\n\n예: 주요 업무, 자격요건, 우대사항, 지원동기 700자, 협업 경험 1000자"
          }
          className="h-[340px] w-full resize-none rounded-[22px] border border-border bg-background px-5 py-4 text-[15px] leading-7 outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary focus:ring-1 focus:ring-primary/20"
        />

        <div className="relative">
          <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={urlInput}
            onChange={(event) => onUrlInputChange(event.target.value)}
            placeholder="공고 URL이 있으면 붙여넣으세요."
            className="h-12 w-full rounded-[18px] border border-border bg-background pl-11 pr-4 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6 md:left-[var(--sidebar-width,0px)]">
        <p className="hidden text-xs text-muted-foreground sm:block">
          입력한 내용은 다음 단계에서 brief와 문항으로 정리됩니다.
        </p>
        <div className="ml-auto flex items-center gap-2">
          {hasIntakeResult ? (
            <button
              type="button"
              onClick={onUseExistingResult}
              className="inline-flex h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted/60"
            >
              기존 정리본으로 계속
            </button>
          ) : null}
          <button
            type="button"
            onClick={onParse}
            disabled={isParsingIntake || (!rawText.trim() && !urlInput.trim())}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isParsingIntake ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 정리 중
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                AI로 공고 정리
              </>
            )}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {hasIntakeResult && !isTutorial ? (
        <div className="mt-6 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          최근 정리한 공고 정보가 남아 있습니다. 다시 정리하면 새 결과로 덮어쓰고,
          현재 결과를 보려면 다음 단계에서 확인하면 됩니다.
        </div>
      ) : null}
    </section>
  );
}
