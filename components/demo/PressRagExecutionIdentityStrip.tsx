"use client";

type Configuration = "baseline" | "candidate";
type Evidence = Readonly<{
  artifact: string;
  label: string;
  startedAt: string;
  completedAt: string;
  configurationHash: string;
}>;

function kst(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium", hour12: false,
  }).format(new Date(value));
}

export function PressRagExecutionIdentityStrip({
  scenarioLabel, caseId, partition, repetitionIndex, repetitionCount, configuration,
  baselineEvidence, candidateEvidence, onConfigurationChange,
}: {
  scenarioLabel: string;
  caseId: string;
  partition: string;
  repetitionIndex: number;
  repetitionCount: number;
  configuration: Configuration;
  baselineEvidence: Evidence;
  candidateEvidence: Evidence;
  onConfigurationChange: (configuration: Configuration) => void;
}) {
  const artifact = configuration === "baseline" ? baselineEvidence : candidateEvidence;
  const button = "min-h-10 rounded-lg border px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4" aria-label="선택 실행 신원">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">선택 실행</p>
          <h2 className="break-words text-base font-black">{scenarioLabel} <span className="font-mono text-xs text-muted-foreground">{caseId}</span></h2>
          <p className="mt-1 text-xs font-bold text-muted-foreground">{partition} · 반복 {repetitionIndex}/{repetitionCount}</p>
        </div>
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="기록 구성 선택">
          {([['baseline', baselineEvidence], ['candidate', candidateEvidence]] as const).map(([id, evidence]) => (
            <button key={id} type="button" aria-pressed={configuration === id} onClick={() => onConfigurationChange(id)} className={`${button} ${configuration === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
              {evidence.label}
            </button>
          ))}
        </div>
      </div>
      <dl className="grid min-w-0 gap-2 text-xs sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 rounded-lg border border-border bg-background p-2.5">
          <dt className="font-bold text-muted-foreground">선택 구성 아티팩트</dt>
          <dd className="mt-1 break-all font-mono font-bold">{artifact.artifact}</dd>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-background p-2.5">
          <dt className="font-bold text-muted-foreground">아티팩트 전체 실행 기간</dt>
          <dd className="mt-1 break-words">
            <time dateTime={artifact.startedAt}>{artifact.startedAt}</time> — <time dateTime={artifact.completedAt}>{artifact.completedAt}</time><br />
            KST · {kst(artifact.startedAt)} — {kst(artifact.completedAt)}
          </dd>
          <p className="mt-1 font-bold text-amber-800 dark:text-amber-300">개별 반복의 실행 시각이 아니라 아티팩트 전체 수집 기간입니다.</p>
        </div>
      </dl>
    </section>
  );
}
