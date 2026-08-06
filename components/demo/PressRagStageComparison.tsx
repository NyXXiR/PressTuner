import { STATUS_COPY, StatusChip, TRAVERSAL_COPY } from "@/components/demo/pressRagWorkflowCopy";
import type { PressRagWorkflowComparison } from "@/domain/evaluation/pressRagWorkflowComparison";

export function PressRagStageComparison({ comparison, stageLabel }: { comparison: PressRagWorkflowComparison; stageLabel: string }) {
  const displayChange = (kind: PressRagWorkflowComparison["changes"][number]["kind"], value: string) => {
    if (kind === "status" && value in STATUS_COPY) return STATUS_COPY[value as keyof typeof STATUS_COPY].label;
    if (kind === "traversal" && value in TRAVERSAL_COPY) return TRAVERSAL_COPY[value as keyof typeof TRAVERSAL_COPY];
    return value;
  };
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border border-border bg-background p-3 sm:p-4" aria-labelledby="stage-comparison-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="stage-comparison-heading" className="text-sm font-black">{stageLabel} · 기록/테스트 비교</h3>
        {comparison.exactParity === true ? <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">변경 없음 (기록과 정확히 동일)</p> : null}
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-black text-muted-foreground">기록</p>
          <div className="mt-2 flex flex-wrap gap-2"><StatusChip status={comparison.recorded.status} /><span className="text-xs">단계 실행 · {TRAVERSAL_COPY[comparison.recorded.traversal]}</span></div>
          <p className="mt-2 break-words text-xs text-muted-foreground">{comparison.recorded.statusReason}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-black text-muted-foreground">테스트</p>
          {comparison.tested ? <>
            <div className="mt-2 flex flex-wrap gap-2"><StatusChip status={comparison.tested.status} /><span className="text-xs">단계 실행 · {TRAVERSAL_COPY[comparison.tested.traversal]}</span></div>
            <p className="mt-2 break-words text-xs text-muted-foreground">{comparison.tested.statusReason}</p>
          </> : <p className="mt-2 text-xs text-muted-foreground">아직 로컬 판정을 계산하지 않았습니다.</p>}
        </div>
      </div>
      {comparison.changes.length ? (
        <div className="min-w-0">
          <h4 className="text-xs font-black">변경된 값과 판정 {comparison.changes.length}건</h4>
          <dl className="mt-2 grid gap-2">
            {comparison.changes.map((change) => <div key={change.identity} className="grid min-w-0 gap-1 rounded-lg border border-border p-2 text-xs sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
              <dt className="font-bold">{change.label}</dt><dd className="break-words"><span className="font-bold text-muted-foreground">기록 · </span>{displayChange(change.kind, change.recorded)}</dd><dd className="break-words"><span className="font-bold text-muted-foreground">테스트 · </span>{displayChange(change.kind, change.tested)}</dd>
            </div>)}
          </dl>
        </div>
      ) : null}
      {comparison.transitions.length ? <div className="sr-only">전이 비교 {comparison.transitions.map(({ recorded }) => `${recorded.traversal} ${recorded.gateVerdict}`).join(" ")}</div> : null}
    </section>
  );
}
