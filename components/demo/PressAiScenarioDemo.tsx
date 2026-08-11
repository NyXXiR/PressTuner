"use client";

import { useReducer, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import {
  PRESS_AI_SCENARIO_FIXTURE,
  PRESS_AI_SCENARIO_NODES,
  createInitialPressAiScenarioState,
  getPressAiScenarioNodeState,
  isValidScenarioLaunchDate,
  pressAiScenarioReducer,
  type PressAiScenarioNodeId,
  type PressAiScenarioNodeState,
  type PressAiScenarioState,
} from "@/domain/demo/pressAiScenario";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const actionButton = `${focusRing} inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45`;

const DRAFT_NODE_ID = "draft-generation";
const REVIEW_NODE_ID = "draft-review";

const statePresentation: Record<
  PressAiScenarioNodeState,
  { label: string; className: string; icon: typeof Circle }
> = {
  waiting: {
    label: "대기",
    className: "border-border bg-muted/25 text-muted-foreground",
    icon: Circle,
  },
  active: {
    label: "실행 가능",
    className: "border-primary bg-primary/10 text-primary",
    icon: LoaderCircle,
  },
  failed: {
    label: "실패",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  completed: {
    label: "완료",
    className: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
};

export function PressAiScenarioDemo() {
  const [state, dispatch] = useReducer(
    pressAiScenarioReducer,
    undefined,
    createInitialPressAiScenarioState,
  );
  const nodeButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const launchDateInput = useRef<HTMLInputElement | null>(null);

  function openFailure() {
    dispatch({ type: "open_failure" });
    requestAnimationFrame(() => launchDateInput.current?.focus());
  }

  function retryDraft() {
    if (!isValidScenarioLaunchDate(state.launchDate)) return;
    dispatch({ type: "retry_draft" });
    requestAnimationFrame(() => nodeButtons.current[REVIEW_NODE_ID]?.focus());
  }

  function resetScenario() {
    dispatch({ type: "reset" });
    requestAnimationFrame(() =>
      nodeButtons.current[PRESS_AI_SCENARIO_NODES[0].id]?.focus(),
    );
  }

  return (
    <section
      aria-labelledby="press-ai-scenario-heading"
      className="bg-background px-4 py-10 text-foreground sm:px-6 sm:py-14"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
            Deterministic scenario
          </p>
          <h1
            id="press-ai-scenario-heading"
            className="mt-3 text-3xl font-black tracking-tight sm:text-5xl"
          >
            실패와 재시도까지 직접 실행하는 Press AI 시나리오
          </h1>
          <p className="mt-5 text-base leading-8 text-muted-foreground sm:text-lg">
            실제 보도자료 프로세스의 다섯 노드를 순서대로 실행해 보세요.
            입력 변경만으로는 다음 단계로 넘어가지 않으며, 모든 결과는 고정된
            가상 샘플입니다.
          </p>
        </div>

        <div
          className="mt-8 border border-border bg-card px-4 py-3 text-sm leading-6"
          aria-live="polite"
          data-testid="scenario-live-status"
        >
          <span className="font-bold">현재 상태 · </span>
          {state.statusMessage}
        </div>

        <ol
          className="mt-6 grid min-w-0 grid-cols-1 gap-0 lg:grid-cols-5 lg:gap-5"
          aria-label="보도자료 작성 시나리오 순서"
        >
          {PRESS_AI_SCENARIO_NODES.map((node, index) => {
            const nodeState = getPressAiScenarioNodeState(state, node.id);
            const presentation = statePresentation[nodeState];
            const StatusIcon = presentation.icon;
            const isCurrent = state.currentNodeId === node.id;
            const isFailedDraft =
              node.id === DRAFT_NODE_ID && state.failedNodeId === node.id;
            const unavailable = nodeState !== "active" || isFailedDraft;
            const buttonLabel =
              node.id === REVIEW_NODE_ID && state.reviewRuns === 1
                ? "초안 리뷰 반복 실행"
                : `${node.label} 실행`;

            return (
              <li key={node.id} className="relative min-w-0">
                <article
                  data-node-id={node.id}
                  data-node-state={nodeState}
                  className={`h-full min-w-0 overflow-hidden border bg-card ${
                    isCurrent ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-border"
                  }`}
                >
                  <div className="min-w-0 p-4 sm:p-5 lg:p-4 xl:p-5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="font-mono text-xs font-bold text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-1 text-[11px] font-bold ${presentation.className}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {presentation.label}
                      </span>
                    </div>
                    <h2 className="mt-4 break-words text-lg font-black leading-7">
                      {node.label}
                    </h2>

                    <NodeEvidence state={state} nodeId={node.id} />

                    {isFailedDraft ? (
                      <DraftFailureRepair
                        state={state}
                        inputRef={launchDateInput}
                        onOpen={openFailure}
                        onDateChange={(value) =>
                          dispatch({
                            type: "set_launch_date",
                            value,
                          })
                        }
                        onRetry={retryDraft}
                      />
                    ) : (
                      <button
                        ref={(element) => {
                          nodeButtons.current[node.id] = element;
                        }}
                        type="button"
                        disabled={unavailable}
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={() =>
                          dispatch({ type: "run_node", nodeId: node.id })
                        }
                        className={`${actionButton} mt-5 border border-border bg-background hover:border-primary hover:text-primary`}
                      >
                        {buttonLabel}
                      </button>
                    )}

                    {node.id === REVIEW_NODE_ID ? (
                      <ReviewSelfLoop state={state} />
                    ) : null}
                  </div>
                </article>

                {index < PRESS_AI_SCENARIO_NODES.length - 1 ? (
                  <span aria-hidden="true">
                    <span className="mx-auto block h-5 w-px bg-border lg:hidden" />
                    <span className="absolute -right-5 top-14 hidden h-px w-5 bg-border lg:block" />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-7 flex flex-col gap-4 border border-border bg-muted/25 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold">
              {state.isComplete
                ? "시나리오 완료 · 선택한 리뷰 제안이 최종 문서에 반영되었습니다."
                : "각 실행 버튼을 직접 눌러야 상태가 바뀝니다."}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
              초기화, 날짜 입력, 리뷰 반복을 포함한 모든 상태는 브라우저 메모리에서만 유지됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={resetScenario}
            className={`${actionButton} shrink-0 border border-border bg-background hover:border-primary sm:w-auto`}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            처음부터 다시 재생
          </button>
        </div>
      </div>
    </section>
  );
}

function NodeEvidence({
  state,
  nodeId,
}: {
  state: PressAiScenarioState;
  nodeId: PressAiScenarioNodeId;
}) {
  const nodeState = getPressAiScenarioNodeState(state, nodeId);
  let content = "앞 단계가 끝나면 실행할 수 있습니다.";

  if (nodeState === "active") content = "준비됨 · 버튼을 눌러 명시적으로 실행하세요.";
  if (nodeId === "article-initialization" && nodeState === "completed") {
    content = "가상 문서 컨텍스트 준비 완료 · 저장 없음";
  }
  if (nodeId === "brief-normalization" && nodeState === "completed") {
    content = PRESS_AI_SCENARIO_FIXTURE.normalizedBrief;
  }
  if (nodeId === DRAFT_NODE_ID && nodeState === "failed") {
    content = PRESS_AI_SCENARIO_FIXTURE.failureMessage;
  }
  if (nodeId === DRAFT_NODE_ID && nodeState === "completed") {
    content = PRESS_AI_SCENARIO_FIXTURE.draftTitle;
  }
  if (nodeId === REVIEW_NODE_ID && state.reviewRuns > 0) {
    content = PRESS_AI_SCENARIO_FIXTURE.reviewNote;
  }
  if (nodeId === "selected-rewrite" && nodeState === "completed") {
    content = PRESS_AI_SCENARIO_FIXTURE.finalTitle;
  }

  return (
    <p className="mt-3 min-h-16 break-words text-xs leading-5 text-muted-foreground">
      {content}
    </p>
  );
}

function DraftFailureRepair({
  state,
  inputRef,
  onOpen,
  onDateChange,
  onRetry,
}: {
  state: PressAiScenarioState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onOpen: () => void;
  onDateChange: (value: string) => void;
  onRetry: () => void;
}) {
  const launchDateValid = isValidScenarioLaunchDate(state.launchDate);

  return (
    <div className="mt-5 min-w-0">
      <button
        type="button"
        aria-current="step"
        aria-expanded={state.failureOpen}
        aria-controls="draft-failure-repair"
        disabled={state.failureOpen}
        onClick={onOpen}
        className={`${actionButton} border border-destructive/40 bg-destructive/10 text-destructive`}
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {state.failureOpen ? "실패 내용 열림" : "실패 내용 열기"}
      </button>

      {state.failureOpen ? (
        <div
          id="draft-failure-repair"
          className="mt-4 min-w-0 border border-destructive/30 bg-destructive/5 p-3"
        >
          <p role="alert" className="break-words text-xs font-bold leading-5 text-destructive">
            {PRESS_AI_SCENARIO_FIXTURE.failureMessage}
          </p>
          <label
            htmlFor="scenario-launch-date"
            className="mt-4 block text-xs font-bold"
          >
            출시일
          </label>
          <input
            ref={inputRef}
            id="scenario-launch-date"
            type="date"
            value={state.launchDate}
            aria-describedby="scenario-launch-date-hint scenario-launch-date-error"
            onChange={(event) => onDateChange(event.target.value)}
            className={`${focusRing} mt-2 min-h-11 w-full min-w-0 border border-border bg-background px-3 text-sm`}
          />
          <p
            id="scenario-launch-date-hint"
            className="mt-2 break-words text-xs leading-5 text-muted-foreground"
          >
            {PRESS_AI_SCENARIO_FIXTURE.launchDateHint}
          </p>
          <p
            id="scenario-launch-date-error"
            className="mt-1 min-h-5 break-words text-xs font-semibold text-destructive"
          >
            {state.launchDate && !launchDateValid
              ? "YYYY-MM-DD 형식의 실제 날짜를 입력하세요."
              : !state.launchDate
                ? "출시일을 입력해야 다시 시도할 수 있습니다."
                : ""}
          </p>
          <button
            type="button"
            disabled={!launchDateValid}
            onClick={onRetry}
            className={`${actionButton} mt-3 bg-primary text-primary-foreground hover:opacity-90`}
          >
            수정한 메모로 다시 시도
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReviewSelfLoop({ state }: { state: PressAiScenarioState }) {
  const isRecorded = state.reviewLoopRecorded;

  return (
    <figure className="mt-5 min-w-0 overflow-hidden border-t border-border pt-4">
      <svg
        role="img"
        aria-labelledby="review-loop-title"
        viewBox="0 0 220 92"
        className="mx-auto block h-24 w-full max-w-[220px]"
      >
        <title id="review-loop-title">초안 리뷰 반복 self-loop</title>
        <defs>
          <marker
            id="review-loop-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" className="fill-current" />
          </marker>
        </defs>
        <path
          id="review-loop-path"
          d="M52 68 C20 62 18 22 110 18 C202 22 200 62 168 68"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={isRecorded ? undefined : "5 5"}
          markerEnd="url(#review-loop-arrow)"
          className={isRecorded ? "text-primary" : "text-muted-foreground/50"}
        />
        {isRecorded ? (
          <circle r="5" className="fill-primary motion-reduce:hidden">
            <animateMotion
              dur="1.1s"
              repeatCount="1"
              path="M52 68 C20 62 18 22 110 18 C202 22 200 62 168 68"
            />
          </circle>
        ) : null}
      </svg>
      <figcaption className="break-words text-center text-xs font-bold text-muted-foreground">
        {isRecorded ? "2회 실행 · 반복 이력 보존" : "리뷰 반복 경로 · 아직 실행 전"}
      </figcaption>
    </figure>
  );
}
