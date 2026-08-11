import { PUBLIC_PRESS_RAG_EVIDENCE } from "@/domain/demo/pressRagScenarioContract";

export function PressAiScenarioEvidencePanel() {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-5" aria-labelledby="scenario-evidence-heading">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">Fixed evidence</p>
      <h2 id="scenario-evidence-heading" className="mt-1 text-xl font-black">{PUBLIC_PRESS_RAG_EVIDENCE.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{PUBLIC_PRESS_RAG_EVIDENCE.id} · 서버와 화면이 동일한 원자 팩트를 사용합니다.</p>
      <div className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm leading-7">{PUBLIC_PRESS_RAG_EVIDENCE.text}</div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {PUBLIC_PRESS_RAG_EVIDENCE.facts.map((fact) => <li key={fact.id} className="min-w-0 rounded border border-border p-3 text-xs"><strong className="block break-all">{fact.id}</strong><span className="mt-1 block text-muted-foreground">{fact.excerpt}</span></li>)}
      </ol>
    </section>
  );
}
