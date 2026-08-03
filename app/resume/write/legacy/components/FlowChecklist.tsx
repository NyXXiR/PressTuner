"use client";

import clsx from "clsx";
import { CheckCircle2, CircleDashed, ArrowRight } from "lucide-react";
import { useResumeWriteStore } from "@/stores/useResumeWriteStore";

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  current: boolean;
};

export default function FlowChecklist() {
  const store = useResumeWriteStore();

  const hasBricks = store.userBricks.length > 0;
  const hasQuestions = store.questions.some(
    (question) => question.questionText.trim().length > 0,
  );
  const hasStartedWriting = store.questions.some(
    (question) => question.answer.trim().length > 0 || question.isCompleted,
  );
  const allCompleted =
    store.questions.length > 0 &&
    store.questions.every((question) => question.isCompleted);

  const items: ChecklistItem[] = [
    {
      key: "bricks",
      title: "경험 브릭 준비",
      description: hasBricks ? `${store.userBricks.length}개 브릭 보유` : "먼저 재료를 모읍니다",
      done: hasBricks,
      current: !hasBricks,
    },
    {
      key: "collect",
      title: "문항 정리",
      description: hasQuestions ? "문항 입력 완료" : "공고나 문항을 정리합니다",
      done: hasQuestions,
      current: hasBricks && store.step === "COLLECT",
    },
    {
      key: "plan",
      title: "작성 준비",
      description: store.appId ? "지원서 생성 완료" : "문항과 브릭을 확인합니다",
      done: !!store.appId,
      current: store.step === "PLAN",
    },
    {
      key: "draft",
      title: "문항별 작성",
      description: hasStartedWriting ? "초안 작성 진행 중" : "같은 작업대에서 한 문항씩 작성",
      done: allCompleted,
      current: store.step === "DRAFT" && !allCompleted,
    },
    {
      key: "recycle",
      title: "브릭 환류",
      description: allCompleted ? "다음 단계에서 연결 예정" : "완료 후 새 경험을 반영",
      done: false,
      current: allCompleted,
    },
  ];

  return (
    <section className="rounded-[28px] border border-border bg-card/60 p-4 shadow-sm md:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
            Progress Checklist
          </div>
          <h2 className="mt-2 text-lg font-bold text-foreground">
            현재 진행도와 남은 단계
          </h2>
        </div>
        <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          {items.filter((item) => item.done).length} / {items.length} 완료
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={clsx(
              "rounded-[22px] border p-4 transition-all",
              item.done
                ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                : item.current
                  ? "border-primary/30 bg-primary/[0.05]"
                  : "border-border bg-background",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={clsx(
                  "text-xs font-bold uppercase tracking-[0.16em]",
                  item.done
                    ? "text-emerald-600"
                    : item.current
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                Step {index + 1}
              </div>
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : item.current ? (
                <ArrowRight className="h-4 w-4 text-primary" />
              ) : (
                <CircleDashed className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="mt-3 text-sm font-semibold text-foreground">{item.title}</div>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
