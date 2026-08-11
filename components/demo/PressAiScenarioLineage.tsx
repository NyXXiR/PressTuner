import type { PublicPressRagAttempt } from "@/domain/demo/pressRagScenarioContract";

export function PressAiScenarioLineage(props: { attempts: PublicPressRagAttempt[]; activeAttemptId: string; onSelect: (attempt: PublicPressRagAttempt) => void }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="scenario-lineage-heading">
      <h3 id="scenario-lineage-heading" className="font-black">시도 계보</h3>
      <ol className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        {props.attempts.map((attempt, index) => <li key={attempt.id} className="flex min-w-0 items-center gap-2">{index ? <span aria-hidden="true">→</span> : null}<button type="button" onClick={() => props.onSelect(attempt)} className={`min-h-11 min-w-0 rounded-lg border px-3 text-left text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${attempt.id === props.activeAttemptId ? "border-primary bg-primary/10" : "border-border"}`}><span className="block truncate">{attempt.parentAttemptId ? "재시도" : "최초 시도"} · {attempt.id}</span><span className="mt-0.5 block text-muted-foreground">revision {attempt.revision} · {attempt.status}</span></button></li>)}
      </ol>
    </section>
  );
}
