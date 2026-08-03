"use client";

import { Sparkles } from "lucide-react";

type BrickRoughInputProps = {
  readonly roughMemo: string;
  readonly organizeError: string | null;
  readonly onChange: (value: string) => void;
};

export function BrickRoughInput({
  roughMemo,
  organizeError,
  onChange,
}: BrickRoughInputProps) {
  return (
    <div className="space-y-4">
      <div className="border border-ai/30 bg-ai/10 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-ai">
          <Sparkles className="h-4 w-4" />
          AI로 경험 정리
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          한 번에 여러 경험을 붙여넣어도 됩니다. AI가 경험별 후보로 나눕니다.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground">
          거친 경험 메모
        </label>
        <textarea
          value={roughMemo}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[200px] w-full resize-none border border-border bg-background p-4 text-sm leading-7 text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-ai/50 focus:ring-4 focus:ring-ai/15"
          placeholder={`예: 첫째, AI 워크플로우 프로젝트를 진행했습니다.
둘째, 통계 조회 성능을 개선했습니다.
셋째, 도메인 중심 구조를 적용했습니다.`}
        />
        {organizeError ? (
          <p className="text-xs font-semibold text-destructive">
            {organizeError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
