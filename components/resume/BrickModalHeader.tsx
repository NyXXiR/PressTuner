"use client";

import { X } from "lucide-react";

type BrickModalHeaderProps = {
  readonly isCreateMode: boolean;
  readonly onClose: () => void;
};

export function BrickModalHeader({
  isCreateMode,
  onClose,
}: BrickModalHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-6 py-4">
      <div>
        <h3 className="text-lg font-bold text-foreground">
          {isCreateMode ? "새 경험 추가" : "경험 수정"}
        </h3>
        {isCreateMode ? (
          <p className="mt-1 text-xs text-muted-foreground">
            대충 적어도 AI가 경험별 제목, 내용, 태그로 정리합니다.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="닫기"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
