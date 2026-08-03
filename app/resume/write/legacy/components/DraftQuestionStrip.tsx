"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { QuestionState } from "@/stores/useResumeWriteStore";

type Props = {
  questions: QuestionState[];
  activeIndex: number;
  onSelectQuestion: (index: number) => void;
};

export default function DraftQuestionStrip({
  questions,
  activeIndex,
  onSelectQuestion,
}: Props) {
  return (
    <section className="rounded-[18px] border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => {
          const statusLabel =
            question.draftStatus === "generating"
              ? "대기"
              : question.isCompleted
                ? "완료"
                : question.answer.trim()
                  ? "작성중"
                  : "대기";

          return (
            <button
              key={question.id}
              onClick={() => {
                if (question.draftStatus === "generating") return;
                onSelectQuestion(index);
              }}
              disabled={question.draftStatus === "generating"}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all",
                index === activeIndex
                  ? "border-primary/30 bg-primary/[0.06]"
                  : "border-border bg-background hover:border-primary/20",
                question.draftStatus === "generating" && "cursor-wait",
              )}
            >
              <span className="font-semibold text-foreground">Q{index + 1}</span>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  question.draftStatus === "generating"
                    ? "bg-amber-500/10 text-amber-700"
                    : question.isCompleted
                      ? "bg-emerald-500/10 text-emerald-600"
                      : question.answer.trim()
                        ? "bg-blue-500/10 text-blue-600"
                        : "bg-secondary text-muted-foreground",
                )}
              >
                {statusLabel}
              </span>
              {question.draftStatus === "generating" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
