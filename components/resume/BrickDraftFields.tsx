"use client";

import { Calendar, Hash, Plus, Sparkles, X } from "lucide-react";
import clsx from "clsx";

import type { BrickData } from "@/components/resume/brickModalTypes";

type BrickDraftFieldsProps = {
  readonly formData: BrickData;
  readonly errors: Record<string, string>;
  readonly tagInput: string;
  readonly showAiHint: boolean;
  readonly onChange: (patch: Partial<BrickData>) => void;
  readonly onTagInputChange: (value: string) => void;
  readonly onAddTag: () => void;
  readonly onRemoveTag: (tag: string) => void;
  readonly onClearError: (field: string) => void;
};

export function BrickDraftFields({
  formData,
  errors,
  tagInput,
  showAiHint,
  onChange,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
  onClearError,
}: BrickDraftFieldsProps) {
  const tags = formData.tags ?? [];

  return (
    <div className="space-y-5">
      {showAiHint ? (
        <div className="border border-ai/25 bg-ai/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-ai">
            <Sparkles className="h-4 w-4" />
            정리된 내용만 확인하고 저장하세요.
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            제목, 핵심 내용, 기간, 태그를 필요할 때만 수정하면 됩니다.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          경험 제목 <span className="text-red-500">*</span>
        </label>
        <input
          value={formData.title}
          onChange={(event) => {
            onChange({ title: event.target.value });
            onClearError("title");
          }}
          className={clsx(
            "h-11 w-full border bg-background px-3 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20",
            errors.title ? "border-red-500" : "border-border",
          )}
          placeholder="예: OOO 프로젝트 리드 개발"
        />
        {errors.title ? (
          <p className="mt-1 text-xs text-red-500 animate-in slide-in-from-top-1">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          상세 내용 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formData.content}
          onChange={(event) => {
            onChange({ content: event.target.value });
            onClearError("content");
          }}
          className={clsx(
            "min-h-[160px] w-full resize-none border bg-background p-3 leading-relaxed transition-all focus:outline-none focus:ring-2 focus:ring-primary/20",
            errors.content ? "border-red-500" : "border-border",
          )}
          placeholder="상황, 행동, 결과가 드러나도록 정리해보세요."
        />
        {errors.content ? (
          <p className="mt-1 text-xs text-red-500 animate-in slide-in-from-top-1">
            {errors.content}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Calendar size={12} /> 기간 (선택)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={formData.startDate ?? ""}
            onChange={(event) => onChange({ startDate: event.target.value })}
            className="h-10 flex-1 border border-border bg-background px-3 text-sm"
          />
          <span className="text-muted-foreground">~</span>
          <input
            type="month"
            value={formData.endDate ?? ""}
            onChange={(event) => onChange({ endDate: event.target.value })}
            disabled={formData.isCurrent}
            className={clsx(
              "h-10 flex-1 border border-border bg-background px-3 text-sm",
              formData.isCurrent && "cursor-not-allowed bg-muted opacity-50",
            )}
          />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="checkbox"
            id="isCurrent"
            checked={Boolean(formData.isCurrent)}
            onChange={(event) =>
              onChange({
                isCurrent: event.target.checked,
                ...(event.target.checked ? { endDate: "" } : {}),
              })
            }
            className="rounded border-border text-primary focus:ring-primary/20"
          />
          <label
            htmlFor="isCurrent"
            className="cursor-pointer select-none text-xs text-muted-foreground"
          >
            현재 진행 중
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Hash size={12} /> 태그 (선택)
        </label>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(event) => onTagInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddTag();
              }
            }}
            className="h-10 flex-1 border border-border bg-background px-3 text-sm transition-colors focus:border-primary focus:outline-none"
            placeholder="태그 입력 후 Enter"
          />
          <button
            type="button"
            onClick={onAddTag}
            disabled={!tagInput.trim()}
            className="flex h-10 items-center justify-center bg-secondary px-4 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:opacity-50"
            aria-label="태그 추가"
          >
            <Plus size={16} />
          </button>
        </div>
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  className="transition-colors hover:text-red-500"
                  aria-label={`${tag} 태그 삭제`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
