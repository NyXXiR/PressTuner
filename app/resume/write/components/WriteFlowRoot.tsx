"use client";

import { Check, Eye, Layers3, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  FlowStage,
  ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";
import {
  selectAppliedBrickDelta,
  selectCompletedCount,
} from "@/domain/resume-writing/flowMachine";
import { toQuotaView, type QuotaView } from "@/lib/quota/quotaView";
import { useMeStore } from "@/stores/useMeStore";

import { FlowCaptureStage } from "./FlowCaptureStage";
import { FlowDone } from "./FlowDone";
import { FlowIntake } from "./FlowIntake";
import { FlowReview } from "./FlowReview";
import { FlowWriting } from "./FlowWriting";
import type { FlowDispatch } from "./flowViewTypes";
import { createResumeWriteFlowPreviewState } from "./flowPreviewState";
import { useWriteFlow, type WriteFlowCommands } from "./useWriteFlow";

const STAGES = ["intake", "review", "writing", "capture", "done"] as const;
const STAGE_LABELS = [
  "원문 입력",
  "정리 확인",
  "작성·첨삭",
  "마무리 확인",
  "완료",
] as const;

const PHASES = [
  { key: "prepare", label: "준비" },
  { key: "write", label: "작성" },
  { key: "finish", label: "마무리" },
] as const;

const STAGE_PHASE = {
  intake: 0,
  review: 0,
  writing: 1,
  capture: 2,
  done: 2,
} satisfies Record<FlowStage, number>;

class UnexpectedFlowStageError extends Error {
  constructor(readonly stage: never) {
    super("Unexpected resume write flow stage");
    this.name = "UnexpectedFlowStageError";
  }
}

function renderStage(
  state: ResumeWriteFlowState,
  dispatch: FlowDispatch,
  commands: WriteFlowCommands,
) {
  const stage = state.stage;
  switch (stage) {
    case "intake":
      return (
        <FlowIntake
          state={state}
          onAction={dispatch}
          onOrganize={() => void commands.organize()}
        />
      );
    case "review":
      return (
        <FlowReview
          state={state}
          onAction={dispatch}
          onStart={() => void commands.start()}
        />
      );
    case "writing":
      return <FlowWriting state={state} onAction={dispatch} commands={commands} />;
    case "capture":
      return <FlowCaptureStage state={state} onAction={dispatch} commands={commands} />;
    case "done":
      return (
        <FlowDone
          state={state}
          onReset={commands.resetFlow}
          commands={commands}
        />
      );
    default:
      throw new UnexpectedFlowStageError(stage);
  }
}

function BrickCounter({
  total,
  delta,
}: {
  readonly total: number;
  readonly delta: number;
}) {
  return (
    <span
      key={delta}
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tabular-nums text-muted-foreground ${delta > 0 ? "animate-flow-pop" : ""}`}
      title="보유한 경력 기억과 이번 작성에서 늘어난 경험"
    >
      <Layers3 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      경험 {total}
      {delta > 0 && <b className="text-primary"> +{delta}</b>}
    </span>
  );
}

function JourneyHeader({
  state,
  onReset,
  showReset,
}: {
  readonly state: ResumeWriteFlowState;
  readonly onReset: () => void;
  readonly showReset: boolean;
}) {
  const currentPhase = STAGE_PHASE[state.stage];
  const brickDelta = selectAppliedBrickDelta(state);
  const brickTotal = state.userBricks.length;
  const completedCount = selectCompletedCount(state);
  const showIdentity = Boolean(state.company.trim()) && state.stage !== "intake";

  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
      <ol className="flex items-center gap-5" aria-label="작성 여정">
        {PHASES.map((phase, index) => {
          const isCurrent = index === currentPhase;
          const isPast = index < currentPhase;
          return (
            <li key={phase.key}>
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`inline-flex items-center gap-1 pb-1 text-xs ${
                  isCurrent
                    ? "border-b-2 border-primary font-bold text-foreground"
                    : isPast
                      ? "font-semibold text-primary"
                      : "text-muted-foreground"
                }`}
              >
                {phase.label}
                {isPast && <Check className="h-3 w-3" aria-hidden="true" />}
              </span>
            </li>
          );
        })}
      </ol>

      {showIdentity && (
        <p className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">
          {state.company.trim() && (
            <span className="font-bold text-foreground">{state.company}</span>
          )}
          {state.job.trim() && <span> · {state.job}</span>}
        </p>
      )}

      <div className="flex items-center gap-3">
        {state.stage === "writing" && state.questions.length > 0 && (
          <span className="font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
            문항 {completedCount}/{state.questions.length}
          </span>
        )}
        {brickTotal > 0 && <BrickCounter total={brickTotal} delta={brickDelta} />}
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-8 items-center gap-1.5 border border-border bg-background px-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">처음부터</span>
          </button>
        )}
      </div>
    </div>
  );
}

function QuotaWarning({ quota }: { readonly quota: QuotaView | null }) {
  const [limitedDismissed, setLimitedDismissed] = useState(false);

  if (!quota) return null;

  if (quota.status === "limited" && !limitedDismissed) {
    return (
      <div className="border-b border-destructive/30 bg-destructive/10">
        <div className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs font-semibold text-destructive sm:px-6">
          <p>
            지금은 AI 초안·첨삭을 쓸 수 없어요. {quota.resetAtLabel}에 초기화됩니다. 직접 작성은 계속 가능합니다.
          </p>
          <button
            type="button"
            onClick={() => setLimitedDismissed(true)}
            aria-label="AI 한도 안내 닫기"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (quota.status === "near_limit") {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-400 sm:px-6">
        AI 사용 가능 횟수가 {quota.remaining}회 남았어요.
      </div>
    );
  }

  return null;
}

type WriteFlowRootProps = {
  readonly canPreviewStages?: boolean;
  readonly initialAppId?: string;
  readonly isTutorial?: boolean;
};

export function WriteFlowRoot({
  canPreviewStages = false,
  initialAppId,
  isTutorial,
}: WriteFlowRootProps) {
  const { state, dispatch, hydrated, commands } = useWriteFlow(
    initialAppId,
    isTutorial,
  );
  const resumeQuotaUsage = useMeStore((store) => store.me?.usage?.resume);
  const resumeQuota = resumeQuotaUsage ? toQuotaView(resumeQuotaUsage) : null;
  const [previewStage, setPreviewStage] = useState<FlowStage | null>(null);
  const visibleState = previewStage
    ? createResumeWriteFlowPreviewState(previewStage)
    : state;

  useEffect(() => {
    if (isTutorial) {
      window.sessionStorage.setItem(
        "presstuner.resume-write-tutorial-seen:v1",
        "1",
      );
    }
  }, [isTutorial]);

  if (!hydrated) {
    return (
      <div className="wongoji wongoji-sharp flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="wongoji wongoji-sharp mx-auto w-full max-w-[1180px] bg-background text-foreground">
      <div className="border-b border-border/70">
        <JourneyHeader
          state={visibleState}
          onReset={commands.resetFlow}
          showReset={
            !previewStage && state.stage !== "intake" && state.stage !== "done"
          }
        />
      </div>

      {canPreviewStages && (
        <aside className="border-b border-ai/20 bg-ai-soft/60 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Eye className="h-4 w-4 text-ai" aria-hidden="true" />
              관리자 화면 보기
            </span>
            <button
              type="button"
              onClick={() => setPreviewStage(null)}
              className={`border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                previewStage === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              실제 흐름
            </button>
            {STAGES.map((stage, index) => (
              <button
                key={stage}
                type="button"
                onClick={() => setPreviewStage(stage)}
                className={`border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  previewStage === stage
                    ? "border-ai bg-ai text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {STAGE_LABELS[index]}
              </button>
            ))}
            {previewStage && (
              <span className="text-xs text-muted-foreground">
                화면 확인 전용 · 내부 동작은 비활성화됨
              </span>
            )}
          </div>
        </aside>
      )}

      <div inert={previewStage !== null}>
        {visibleState.notice && (
          <div
            className={`border-b ${
              isTutorial
                ? "border-primary bg-primary/10"
                : "border-primary/10 bg-primary/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold text-primary sm:px-6">
              <p>{visibleState.notice}</p>
              <div className="flex items-center gap-2">
                {isTutorial && (
                  <button
                    type="button"
                    onClick={() => {
                      window.sessionStorage.setItem(
                        "presstuner.resume-write-tutorial-seen:v1",
                        "1",
                      );
                      window.location.href = "/resume/write";
                    }}
                    className="inline-flex h-7 items-center gap-1 border border-primary px-2 text-[11px] font-bold transition-colors hover:bg-primary/10"
                  >
                    튜토리얼 종료
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "dismiss_notice" })}
                  aria-label="안내 닫기"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center hover:bg-primary/10"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        <QuotaWarning key={resumeQuota?.status ?? "unknown"} quota={resumeQuota} />

        <main className="px-4 py-6 sm:px-6 sm:py-8">
          {renderStage(visibleState, dispatch, commands)}
        </main>
      </div>
    </div>
  );
}
