"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, FilePlus2, Link2, Loader2, RefreshCw, X } from "lucide-react";

export type InlineBrickCaptureItem = {
  readonly previewId: string;
  readonly mode: "create" | "link" | "augment";
  readonly title: string; readonly content: string; readonly originalText: string;
  readonly period: string | null;
  readonly tags: readonly string[];
  readonly matchedBrickId: string | null; readonly matchedBrickTitle: string | null;
  readonly reason: string | null; readonly existingContent: string | null;
  readonly existingOriginalText: string | null;
};

type EditableCaptureItem = InlineBrickCaptureItem & {
  readonly selected: boolean;
};

type Props = {
  readonly isOpen: boolean;
  readonly summary: string | null;
  readonly items: readonly InlineBrickCaptureItem[];
  readonly isApplying: boolean;
  readonly onClose: () => void;
  readonly onApply: (items: readonly InlineBrickCaptureItem[]) => void;
};

function getModeMeta(mode: InlineBrickCaptureItem["mode"]) {
  switch (mode) {
    case "create":
      return {
        icon: FilePlus2,
        label: "새 경험을 브릭으로 저장",
        tone: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
      };
    case "link":
      return {
        icon: Link2,
        label: "현재 문항에 연결",
        tone: "text-primary bg-primary/10 border-primary/20",
      };
    case "augment":
      return {
        icon: RefreshCw,
        label: "기존 브릭 보강",
        tone: "text-ai bg-ai/10 border-ai/20",
      };
  }
}

function toEditableItem(item: InlineBrickCaptureItem): EditableCaptureItem {
  return { ...item, selected: true };
}

function toCaptureItem(item: EditableCaptureItem): InlineBrickCaptureItem {
  return {
    previewId: item.previewId,
    mode: item.mode,
    title: item.title,
    content: item.content,
    originalText: item.originalText,
    period: item.period,
    tags: item.tags,
    matchedBrickId: item.matchedBrickId,
    matchedBrickTitle: item.matchedBrickTitle,
    reason: item.reason,
    existingContent: item.existingContent,
    existingOriginalText: item.existingOriginalText,
  };
}

export default function InlineBrickCaptureReview({
  isOpen,
  summary,
  items,
  isApplying,
  onClose,
  onApply,
}: Props) {
  const [draftItems, setDraftItems] = useState<EditableCaptureItem[]>([]);

  useEffect(() => {
    setDraftItems(items.map(toEditableItem));
  }, [items]);

  const selectedItems = useMemo(
    () => draftItems.filter((item) => item.selected).map(toCaptureItem),
    [draftItems],
  );

  if (!isOpen) return null;

  const updateItem = (
    previewId: string,
    patch: Partial<Pick<InlineBrickCaptureItem, "title" | "content">>,
  ) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.previewId === previewId ? { ...item, ...patch } : item,
      ),
    );
  };

  const toggleItem = (previewId: string) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.previewId === previewId
          ? { ...item, selected: !item.selected }
          : item,
      ),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-[24px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-bold text-foreground">
              새 경험을 브릭으로 저장
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {summary ??
                "답변과 AI 대화에서 찾은 경험을 검토한 뒤 현재 문항에 연결합니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="경험 저장 후보 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25 p-4">
          <div className="grid gap-3">
            {draftItems.map((item) => {
              const meta = getModeMeta(item.mode);
              const Icon = meta.icon;

              return (
                <article
                  key={item.previewId}
                  className={clsx(
                    "rounded-[18px] border bg-card p-4 transition-all",
                    item.selected
                      ? "border-primary/25 shadow-sm"
                      : "border-border opacity-65",
                  )}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start">
                    <button
                      type="button"
                      onClick={() => toggleItem(item.previewId)}
                      disabled={isApplying}
                      className={clsx(
                        "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors disabled:opacity-50",
                        item.selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {item.selected ? "적용" : "제외"}
                    </button>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
                            meta.tone,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </span>
                        {item.matchedBrickTitle && (
                          <span className="text-xs text-muted-foreground">
                            기존 브릭: {item.matchedBrickTitle}
                          </span>
                        )}
                      </div>

                      <input
                        value={item.title}
                        onChange={(event) =>
                          updateItem(item.previewId, {
                            title: event.target.value,
                          })
                        }
                        disabled={isApplying || !item.selected}
                        className="w-full border-b border-border/70 bg-transparent py-1 text-sm font-bold text-foreground outline-none transition-colors focus:border-primary disabled:opacity-70"
                        aria-label="브릭 제목"
                      />

                      <textarea
                        value={item.content}
                        onChange={(event) =>
                          updateItem(item.previewId, {
                            content: event.target.value,
                          })
                        }
                        disabled={isApplying || !item.selected}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors focus:border-primary disabled:opacity-70"
                        aria-label="브릭 내용"
                      />

                      {item.reason && (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {item.reason}
                        </p>
                      )}

                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map((tag) => (
                            <span
                              key={`${item.previewId}-${tag}`}
                              className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            선택한 항목은 저장 후 현재 문항에 바로 연결됩니다.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              나중에
            </button>
            <button
              type="button"
              onClick={() => onApply(selectedItems)}
              disabled={isApplying || selectedItems.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-xs font-bold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {selectedItems.length}개 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
