"use client";

import { useState } from "react";

import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { NodeStateBadge } from "./PressAiVerdictBadge";
import {
  focusAnchor,
  nodeState,
  type PressAiNextAction,
} from "./pressAiRunProgress";

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
  onInspectNode: (nodeId: string) => void;
}) {
  const { action } = props;
  // The edge key and attempt-keyed parent boundary ensure edge and attempt identity
  // both isolate acknowledgements.
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
  const inspectNodeId =
    "nodeId" in action
      ? action.nodeId
      : action.kind === "advance"
        ? props.attempt.transitions.find(
            (transition) => transition.edgeId === action.edgeId,
          )?.sourceNodeId ?? null
        : null;

  const run = () => {
    if (action.kind === "execute") props.onExecute(action.nodeId);
    else if (action.kind === "rewrite") props.onRewrite();
    else if (action.kind === "advance")
      props.onAdvance(action.edgeId, warn, human);
    else if (action.kind === "retry") props.onRetry(action.nodeId);
  };

  return (
    <div className="sticky top-0 z-20 mb-4 overflow-hidden rounded-xl border-2 border-primary/45 bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
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
                  onClick={() => props.onInspectNode(node.id)}
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
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-black text-primary">
              지금 해야 할 작업
            </span>
            <strong className="truncate text-base font-black">
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

      </div>

      <div className="flex flex-wrap items-stretch justify-end gap-3 border-t border-primary/20 bg-primary/5 px-4 py-3">
        <div className="mr-auto flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {needsWarn ? (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-800 dark:text-amber-200">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs text-white">1</span>
              <input
                type="checkbox"
                checked={warn}
                onChange={(event) => setAck({ warn: event.target.checked })}
                className="size-5 accent-amber-600"
              />
              <span><strong className="block">필수 확인</strong>WARN 판정을 확인했습니다</span>
            </label>
          ) : null}
          {humanGateLabel ? (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-primary/50 bg-background px-3 py-2 text-sm font-bold shadow-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{needsWarn ? 2 : 1}</span>
              <input
                type="checkbox"
                checked={human}
                onChange={(event) => setAck({ human: event.target.checked })}
                className="size-5 accent-primary"
              />
              <span><strong className="block text-primary">사람 확인 필수</strong>{humanGateLabel}</span>
            </label>
          ) : null}
          {blockedByGate ? (
            <p id="press-ai-gate-help" className="basis-full text-xs font-bold text-primary">
              위 필수 확인을 체크하면 실행 버튼이 활성화됩니다.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
              onClick={() => inspectNodeId && props.onInspectNode(inspectNodeId)}
              className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold"
            >
              Input / Output 보기
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={run}
            aria-describedby={blockedByGate ? "press-ai-gate-help" : undefined}
            className={`min-h-12 min-w-48 rounded-lg px-5 text-sm font-black shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${
              action.kind === "retry"
                ? "border border-rose-500 text-rose-700 dark:text-rose-300"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {action.kind === "idle" ? "실행할 작업 없음" : `▶ ${action.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
