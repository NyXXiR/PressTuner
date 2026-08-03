"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import type { QuestionState } from "@/stores/useResumeWriteStore";

type Props = {
  questions: QuestionState[];
  viewMode: "overview" | "detail";
  allCompleted: boolean;
  isCompletingApplication: boolean;
  onCompleteApplication: () => void;
  onEditStrategy: () => void;
};

export default function DraftHub({
  questions,
  viewMode,
  allCompleted,
  isCompletingApplication,
  onCompleteApplication,
  onEditStrategy,
}: Props) {
  return (
    <>
      <section className="rounded-[20px] border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">
              작성 베이스캠프
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              준비된 문항부터 열어서 첨삭을 시작하세요. 생성 중인 문항은 상태가
              자동으로 갱신됩니다.
            </p>
            {viewMode === "overview" && (
              <p className="mt-2 text-xs text-muted-foreground">
                상단 Q 버튼에서 다른 문항으로 바로 이동할 수 있습니다.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onEditStrategy}
              className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground"
            >
              전략 수정하기
            </button>
            <span className="rounded-full border border-border bg-background px-3 py-1.5">
              생성중{" "}
              {
                questions.filter(
                  (question) => question.draftStatus === "generating",
                ).length
              }
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5">
              첨삭 가능{" "}
              {questions.filter((question) => question.answer.trim()).length}
            </span>
            {allCompleted && (
              <button
                onClick={onCompleteApplication}
                disabled={isCompletingApplication}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50"
              >
                {isCompletingApplication ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                전체 완료 처리
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
