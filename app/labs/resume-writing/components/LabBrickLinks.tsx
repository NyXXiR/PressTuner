import { Layers3 } from "lucide-react";

import type {
  LabQuestion,
  ResumeWritingLabState,
} from "@/domain/resume-writing/labMachine";

import type { LabDispatch } from "./labViewTypes";

type LabBrickLinksProps = {
  readonly state: ResumeWritingLabState;
  readonly question: LabQuestion;
  readonly onAction: LabDispatch;
};

export function LabBrickLinks({ state, question, onAction }: LabBrickLinksProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm" aria-labelledby="lab-brick-links-title">
      <div className="flex items-center gap-2 px-2 pb-3">
        <Layers3 className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="lab-brick-links-title" className="text-xs font-bold">이 문항에 쓸 경험</h2>
      </div>
      <div className="space-y-2">
        {state.bricks.map((brick) => {
          const linked = question.linkedBrickIds.includes(brick.id);
          return (
            <label
              key={brick.id}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors ${
                linked
                  ? "border-primary/30 bg-primary/5"
                  : "border-transparent bg-muted/40 hover:border-border"
              }`}
            >
              <input
                type="checkbox"
                checked={linked}
                onChange={() => onAction({ type: "toggle_brick_link", brickId: brick.id })}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold leading-5">{brick.title}</span>
                <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {brick.tags.map((tag) => `#${tag}`).join(" ")}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="px-2 pt-3 text-[11px] leading-4 text-muted-foreground">
        연결을 바꾼 뒤 AI에게 새 경험 반영을 요청하면 수정안에 활용됩니다.
      </p>
    </section>
  );
}
