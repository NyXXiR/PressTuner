"use client";

import { Check, Layers3, Loader2, X } from "lucide-react";

import type { FlowCapture } from "@/domain/resume-writing/flowMachine";

import type { FlowDispatch } from "./flowViewTypes";

const MODE_LABEL = {
  create: "새 경험으로 저장",
  augment: "기존 경험 보강",
  link: "기존 경험 연결",
} as const;

type FlowCaptureCardProps = {
  readonly capture: FlowCapture;
  readonly questionIndex: number;
  readonly onAction: FlowDispatch;
  readonly onApply: () => void;
  readonly onDismiss: () => void;
  readonly animateIn?: boolean;
};

export function FlowCaptureCard({
  capture,
  questionIndex,
  onAction,
  onApply,
  onDismiss,
  animateIn = false,
}: FlowCaptureCardProps) {
  const resolved = capture.status === "applied" || capture.status === "dismissed";
  const applying = capture.status === "applying";

  return (
    <article
      className={`border-[1.5px] border-dashed border-primary bg-primary/5 p-5 ${
        animateIn ? "animate-flow-rise" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-primary text-primary">
            <Layers3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-primary">
              경험 발견
              {questionIndex >= 0 && ` · 문항 ${questionIndex + 1}`}
            </p>
            <p className="mt-1 text-sm font-bold leading-6 text-foreground">
              {capture.summary}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              반영해도 원고는 바뀌지 않습니다. 경력 기억에만 저장됩니다.
            </p>
          </div>
        </div>
        {resolved && (
          <span
            className={`shrink-0 border px-2.5 py-1 text-[11px] font-bold ${
              capture.status === "applied"
                ? "border-primary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {capture.status === "applied" ? "반영 완료" : "보류함"}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {capture.items.map((item) => {
          const selected = capture.selectedPreviewIds.includes(item.previewId);
          return (
            <label
              key={item.previewId}
              className={`flex items-start gap-3 border p-3 transition-colors ${
                resolved || applying ? "cursor-default" : "cursor-pointer"
              } ${
                selected && !resolved
                  ? "border-primary/40 bg-card"
                  : "border-border bg-card/60"
              } ${resolved && !selected ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={resolved || applying}
                onChange={() =>
                  onAction({
                    type: "toggle_capture_item",
                    captureId: capture.captureId,
                    previewId: item.previewId,
                  })
                }
                className="mt-1 h-4 w-4 border-input accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{item.title}</span>
                  <span
                    className={`border px-2 py-0.5 text-[10.5px] font-extrabold tracking-[0.08em] ${
                      item.mode === "create"
                        ? "border-primary text-primary"
                        : "border-ai text-ai"
                    }`}
                  >
                    {MODE_LABEL[item.mode]}
                  </span>
                </span>
                <span className="mt-1 block line-clamp-3 text-xs leading-5 text-muted-foreground">
                  {item.content}
                </span>
                {item.matchedBrickTitle && (
                  <span className="mt-2 block text-[11px] text-muted-foreground">
                    연결 대상:{" "}
                    <strong className="text-foreground">{item.matchedBrickTitle}</strong>
                  </span>
                )}
                {item.tags.length > 0 && (
                  <span className="mt-2 block text-[11px] font-bold text-muted-foreground">
                    {item.tags.map((tag) => `#${tag}`).join(" ")}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {capture.error && (
        <p
          role="alert"
          className="mt-3 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {capture.error}
        </p>
      )}

      {!resolved && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={applying}
            className="inline-flex h-10 items-center justify-center gap-1.5 border border-border bg-card px-4 text-xs font-bold transition-colors hover:bg-muted disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            이번엔 보류
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying || capture.selectedPreviewIds.length === 0}
            className="inline-flex h-10 items-center justify-center gap-1.5 bg-primary px-4 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            경력 기억에 반영 (+{capture.selectedPreviewIds.length}건)
          </button>
        </div>
      )}
    </article>
  );
}
