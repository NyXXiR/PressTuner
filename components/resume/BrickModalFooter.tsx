"use client";

import { Loader2, Sparkles } from "lucide-react";

type DraftMode = "rough" | "details" | "review";

type BrickModalFooterProps = {
  readonly draftMode: DraftMode;
  readonly isRoughMode: boolean;
  readonly isOrganizing: boolean;
  readonly roughMemo: string;
  readonly selectedCount: number;
  readonly isEditMode: boolean;
  readonly onClose: () => void;
  readonly onManualInput: () => void;
  readonly onOrganize: () => void;
  readonly onSave: () => void;
  readonly onSaveMany: () => void;
};

export function BrickModalFooter({
  draftMode,
  isRoughMode,
  isOrganizing,
  roughMemo,
  selectedCount,
  isEditMode,
  onClose,
  onManualInput,
  onOrganize,
  onSave,
  onSaveMany,
}: BrickModalFooterProps) {
  return (
    <div className="flex justify-end gap-3 border-t border-border bg-card p-5">
      <button
        type="button"
        onClick={onClose}
        disabled={isOrganizing}
        className="border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        취소
      </button>
      {isRoughMode ? (
        <>
          <button
            type="button"
            onClick={onManualInput}
            disabled={isOrganizing}
            className="border border-border px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            직접 입력
          </button>
          <button
            type="button"
            onClick={onOrganize}
            disabled={isOrganizing || roughMemo.trim().length < 10}
            className="inline-flex items-center gap-2 bg-ai px-6 py-2.5 text-sm font-bold text-ai-foreground transition-colors hover:bg-ai/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isOrganizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            AI로 정리
          </button>
        </>
      ) : draftMode === "review" ? (
        <button
          type="button"
          onClick={onSaveMany}
          disabled={selectedCount === 0}
          className="bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          선택한 {selectedCount}개 추가
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          className="bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90"
        >
          {isEditMode ? "수정 완료" : "추가하기"}
        </button>
      )}
    </div>
  );
}
