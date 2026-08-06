"use client";

import { STATUS_COPY, StatusChip, isBrokenStatus } from "@/components/demo/pressRagWorkflowCopy";
import type { PressRagRecordedOutcome } from "@/domain/evaluation/pressRagDemoPresenter";
import type { PressRagWorkflowNodeId, PressRagWorkflowView } from "@/domain/evaluation/pressRagWorkflowView";

export function PressRagWorkflowVerdictHeader({
  recordedWorkflow, testedWorkflow, recordedOutcome, onSelectNode,
}: {
  recordedWorkflow: PressRagWorkflowView;
  testedWorkflow: PressRagWorkflowView | null;
  recordedOutcome: PressRagRecordedOutcome;
  onSelectNode: (id: PressRagWorkflowNodeId) => void;
}) {
  const recordedTerminal = recordedWorkflow.nodes.at(-1)!;
  const testedTerminal = testedWorkflow?.nodes.at(-1) ?? null;
  const firstBroken = recordedWorkflow.nodes.find(({ status }) => isBrokenStatus(status));
  const originalFailure = recordedOutcome.status === "FAILED";
  const originalMismatch = !originalFailure && recordedTerminal.status === "MISMATCH";

  return (
    <section className="grid min-w-0 gap-3" aria-label="원본 기록 판정">
      <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-3">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">기록 최종 판정</p><StatusChip status={recordedTerminal.status} size="md" /></div>
        {testedTerminal ? <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">테스트 최종 판정</p><StatusChip status={testedTerminal.status} size="md" /></div> : null}
        <p className="ml-auto text-xs text-muted-foreground">기록 지연 <strong className="text-foreground">{recordedWorkflow.summary.totalLatencyMs.toLocaleString("ko-KR")} ms</strong></p>
      </div>
      {originalFailure || originalMismatch ? (
        <div role="alert" className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-700 bg-rose-50 p-3 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100">
          <p className="text-sm font-black">
            {originalFailure ? "원본 실행 실패" : "원본 기대 불일치"} · 기록 최종 판정 {STATUS_COPY[recordedTerminal.status].label}
            {firstBroken ? <span className="ml-2 font-normal">처음 깨진 단계: {firstBroken.label}</span> : null}
          </p>
          {firstBroken ? <button type="button" onClick={() => onSelectNode(firstBroken.id)} className="min-h-9 rounded-lg border border-rose-700 px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">해당 단계 보기</button> : null}
        </div>
      ) : (
        <p className="rounded-xl border border-emerald-700/40 bg-emerald-50 p-3 text-sm font-bold text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">원본 기록은 승인된 기대와 일치합니다.</p>
      )}
    </section>
  );
}
