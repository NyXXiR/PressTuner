import { Check, CircleDashed } from "lucide-react";

import type {
  LabQuestionStatus,
  ResumeWritingLabState,
} from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

const STATUS_LABEL = {
  ready: "작성 전",
  drafted: "초안 생성",
  revised: "첨삭 반영",
  saved: "임시저장",
  completed: "완료",
} satisfies Record<LabQuestionStatus, string>;

type LabQuestionNavProps = {
  readonly state: ResumeWritingLabState;
  readonly onAction: LabDispatch;
};

export function LabQuestionNav({ state, onAction }: LabQuestionNavProps) {
  return (
    <nav aria-label="자기소개서 문항" className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <p className="px-2 pb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Questions</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {state.questions.map((question, index) => {
          const active = question.id === state.activeQuestionId;
          const completed = question.status === "completed";
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onAction({ type: "select_question", questionId: question.id })}
              aria-current={active ? "true" : undefined}
              className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-transparent bg-muted/50 hover:border-border hover:bg-muted"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground">문항 {index + 1}</span>
                {completed ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="mt-2 block line-clamp-2 text-xs leading-5 text-muted-foreground">{question.prompt}</span>
              <span className="mt-2 block text-[11px] text-muted-foreground">
                경험 {question.linkedBrickIds.length}개 연결
              </span>
              <span className={`mt-3 inline-block text-[11px] font-bold ${completed ? "text-success" : "text-primary"}`}>
                {STATUS_LABEL[question.status]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
