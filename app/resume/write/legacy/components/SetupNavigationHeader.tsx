"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

type SetupNavigationHeaderProps = {
  readonly isTutorial: boolean;
  readonly canShowIntakeForm: boolean;
  readonly hasIntakeResult: boolean;
  readonly isDirty: boolean;
  readonly onBack: () => void;
  readonly onForward: () => void;
};

export function SetupNavigationHeader({
  isTutorial,
  canShowIntakeForm,
  hasIntakeResult,
  isDirty,
  onBack,
  onForward,
}: SetupNavigationHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex items-center gap-2 sm:mt-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={onForward}
          disabled={!hasIntakeResult || isDirty}
          className="rounded-full border border-border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-35"
        >
          <ArrowRight size={20} />
        </button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {isTutorial
            ? "샘플로 흐름을 확인합니다."
            : canShowIntakeForm
              ? "공고와 자소서 문항을 붙여넣으세요."
              : "먼저 시작할 방식을 고르세요."}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          {isTutorial
            ? "입력 없이 준비된 샘플을 따라가며 제품 흐름만 확인합니다."
            : canShowIntakeForm
              ? "채용 공고, 회사 소개, 자기소개서 문항을 한 번에 넣으면 brief와 문항을 정리합니다."
              : "PDF, 경험 메모, 공고 입력 중 편한 방식으로 시작합니다."}
        </p>
      </div>
    </div>
  );
}
