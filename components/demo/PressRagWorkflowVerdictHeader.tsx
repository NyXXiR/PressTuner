"use client";

import { STATUS_COPY, StatusChip, VerdictChip, isBrokenStatus } from "@/components/demo/pressRagWorkflowCopy";
import type { PressRagWorkflowNodeId, PressRagWorkflowView } from "@/domain/evaluation/pressRagWorkflowView";

/**
 * The one-line answer the debugger owes before anything else: did this run hold up, and if
 * not, which stage broke first. Everything here comes from the already-derived
 * `workflow.summary`; nothing is recomputed in the view.
 */
export function PressRagWorkflowVerdictHeader({
  workflow, recordedWorkflow, isTest, onSelectNode,
}: {
  workflow: PressRagWorkflowView;
  recordedWorkflow: PressRagWorkflowView;
  isTest: boolean;
  onSelectNode: (id: PressRagWorkflowNodeId) => void;
}) {
  const terminal = workflow.nodes.at(-1)!;
  const recordedTerminal = recordedWorkflow.nodes.at(-1)!;
  const changed = isTest && terminal.status !== recordedTerminal.status;
  const firstBroken = workflow.nodes.find(({ status }) => isBrokenStatus(status));
  const brokenCount = workflow.nodes.filter(({ status }) => isBrokenStatus(status)).length;

  return (
    <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-background/70 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">최종 판정</span>
          <StatusChip status={terminal.status} size="md" />
          {changed ? (
            <span className="text-xs font-bold text-muted-foreground">
              기록 {STATUS_COPY[recordedTerminal.status].label} <span aria-hidden="true">→</span> 테스트 {STATUS_COPY[terminal.status].label}
            </span>
          ) : null}
        </div>

        {firstBroken ? (
          <button
            type="button"
            onClick={() => onSelectNode(firstBroken.id)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-700 bg-rose-700 px-3 text-xs font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            처음 깨진 단계 · {firstBroken.label}
            {brokenCount > 1 ? <span className="font-normal">외 {brokenCount - 1}개</span> : null}
            <span aria-hidden="true">↓</span>
          </button>
        ) : (
          <span className="text-xs font-bold text-foreground">깨진 단계 없음 · 모든 단계가 기대와 일치합니다.</span>
        )}

        <p className="ml-auto shrink-0 text-xs text-muted-foreground">
          총 지연 <strong className="font-black text-foreground">{workflow.summary.totalLatencyMs.toLocaleString("ko-KR")} ms</strong>
          <span className="mx-2" aria-hidden="true">·</span>
          기록 상태 {workflow.summary.recordedStatus}
        </p>
      </div>

      <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-5" aria-label="실행 요약 사실">
        {workflow.summary.facts.map((fact) => (
          <li
            key={fact.key}
            title={fact.reasonText ?? undefined}
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-2.5 py-2"
          >
            <span className="truncate text-[11px] font-bold text-muted-foreground">{fact.label}</span>
            <VerdictChip verdict={STATUS_COPY[fact.status].verdict} text={STATUS_COPY[fact.status].label} />
            <span className="truncate text-[10px] text-muted-foreground">{fact.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
