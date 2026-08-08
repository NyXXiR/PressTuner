"use client";

import { useState } from "react";

import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { NodeStateBadge } from "./PressAiVerdictBadge";
import {
  focusAnchor,
  nodeAnchorId,
  nodeState,
  type PressAiNextAction,
} from "./pressAiRunProgress";

/** The button says the command; the line beside it says which step the command lands on. */
const COMMAND_LABEL: Record<PressAiNextAction["kind"], string> = {
  execute: "노드 실행",
  rewrite: "선택 수정 실행",
  advance: "다음 노드 활성화",
  retry: "다시 실행",
  idle: "대기",
};

/**
 * The single fixed home for "what do I press next".
 * Every move the attempt machine allows is rendered here in the same slot, so the
 * primary button never migrates between the graph, the outline and the edge panel.
 */
export function PressAiRunActionBar(props: {
  attempt: PressAiCheckpointAttempt;
  busy: boolean;
  action: PressAiNextAction;
  rewriteReady: boolean;
  onExecute: (nodeId: string) => void;
  onRewrite: () => void;
  onAdvance: (
    edgeId: string,
    acknowledgeWarn: boolean,
    acknowledgeHumanGate: boolean,
  ) => void;
  onRetry: (nodeId: string) => void;
}) {
  const { action } = props;
  // Keyed by edge so acknowledgements never leak from one transition to the next.
  const [acks, setAcks] = useState<
    Record<string, { warn: boolean; human: boolean }>
  >({});
  const gateKey = action.kind === "advance" ? action.edgeId : "";
  const warn = acks[gateKey]?.warn ?? false;
  const human = acks[gateKey]?.human ?? false;
  const setAck = (patch: { warn?: boolean; human?: boolean }) =>
    setAcks((state) => ({
      ...state,
      [gateKey]: { warn, human, ...patch },
    }));

  const needsWarn = action.kind === "advance" && action.needsWarnAck;
  const humanGateLabel =
    action.kind === "advance" ? action.humanGateLabel : null;
  const blockedByGate = (needsWarn && !warn) || (Boolean(humanGateLabel) && !human);
  const disabled =
    props.busy ||
    action.kind === "idle" ||
    blockedByGate ||
    (action.kind === "rewrite" && !props.rewriteReady);

  const activeNode = pressCreationProcess.nodes.find(
    (node) => node.id === props.attempt.activeNodeId,
  );

  const run = () => {
    if (action.kind === "execute") props.onExecute(action.nodeId);
    else if (action.kind === "rewrite") props.onRewrite();
    else if (action.kind === "advance")
      props.onAdvance(action.edgeId, warn, human);
    else if (action.kind === "retry") props.onRetry(action.nodeId);
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-y border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ol className="flex min-w-0 shrink-0 items-center gap-1" aria-label="진행 단계">
          {pressCreationProcess.nodes.map((node) => {
            const state = nodeState(props.attempt, node, props.busy);
            const current =
              action.kind !== "idle" &&
              "nodeId" in action &&
              action.nodeId === node.id;
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => focusAnchor(nodeAnchorId(node.id))}
                  aria-label={`${node.sequence + 1}. ${node.label} 단계로 이동`}
                  aria-current={current ? "step" : undefined}
                  title={`${node.label} · ${state}`}
                  className={`size-9 rounded-full border text-xs font-black transition-colors ${
                    state === "EXECUTED" || state === "RESTORED"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : state === "WAITING"
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-primary bg-primary text-primary-foreground"
                  } ${current ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""}`}
                >
                  {node.sequence + 1}
                </button>
              </li>
            );
          })}
        </ol>

        {/* Full width on mobile: squeezed into the dots' row the label truncated
            while the button row below it sat half empty. */}
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              다음 단계
            </span>
            <strong className="truncate text-sm font-black">
              {action.label}
            </strong>
            {activeNode ? (
              <NodeStateBadge
                state={nodeState(props.attempt, activeNode, props.busy)}
              />
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:truncate">
            {props.busy ? "명령을 저장하고 있습니다." : action.hint}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {needsWarn ? (
            <label className="flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
              <input
                type="checkbox"
                checked={warn}
                onChange={(event) => setAck({ warn: event.target.checked })}
              />
              WARN 확인
            </label>
          ) : null}
          {humanGateLabel ? (
            <label className="flex items-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs font-bold">
              <input
                type="checkbox"
                checked={human}
                onChange={(event) => setAck({ human: event.target.checked })}
              />
              {humanGateLabel}
            </label>
          ) : null}
          {action.kind === "rewrite" && !props.rewriteReady ? (
            <button
              type="button"
              onClick={() => focusAnchor("press-ai-review-selection")}
              className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold"
            >
              노트 선택으로 이동
            </button>
          ) : null}
          {action.kind !== "idle" ? (
            <button
              type="button"
              onClick={() => focusAnchor(action.anchorId)}
              className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold"
            >
              해당 단계 보기
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={run}
            className={`min-h-11 rounded-lg px-4 text-sm font-black disabled:opacity-50 ${
              action.kind === "retry"
                ? "border border-rose-500 text-rose-700 dark:text-rose-300"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {COMMAND_LABEL[action.kind]}
          </button>
        </div>
      </div>
    </div>
  );
}
