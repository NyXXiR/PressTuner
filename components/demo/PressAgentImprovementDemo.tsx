import type { AgentExperimentCycleEvidence } from "@/domain/evaluation/experimentCycleEvidence";
import type { AgentExperimentArtifact } from "@/domain/evaluation/experimentContracts";

function rate(artifact: AgentExperimentArtifact, role: "baseline" | "candidate") {
  const outcomes = artifact.executions[role].outcomes;
  const values = outcomes
    .map(({ observations }) => observations.taskSuccess?.value)
    .filter((value): value is boolean => typeof value === "boolean");
  return values.length
    ? `${Math.round((values.filter(Boolean).length / values.length) * 100)}%`
    : "NOT_EVALUABLE";
}

export function PressAgentImprovementDemo({
  cycle,
  opsUrl,
}: {
  cycle: AgentExperimentCycleEvidence;
  opsUrl?: string;
}) {
  const artifact = cycle.experiment;
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Recorded deterministic evidence · synthetic
        </p>
        <h1 className="text-4xl font-bold">Press Agent improvement experiment</h1>
        <p className="max-w-3xl text-slate-600">
          Two configurations executed independently against the same frozen v3
          environment. This public surface uses fixtures only: it performs no model,
          database, approval, promotion, or deployment action.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        {(["baseline", "candidate"] as const).map((role) => (
          <article key={role} className="rounded-2xl border border-slate-200 p-5">
            <p className="text-sm uppercase text-slate-500">{role}</p>
            <p className="mt-2 text-3xl font-semibold">{rate(artifact, role)}</p>
            <p className="mt-1 text-sm text-slate-500">synthetic task success</p>
            <code className="mt-4 block break-all text-xs">
              {artifact.configurations[role].contentHash}
            </code>
          </article>
        ))}
      </section>
      <section className="rounded-2xl bg-slate-950 p-6 text-slate-100">
        <h2 className="text-xl font-semibold">Evidence boundary</h2>
        <p className="mt-2 text-sm text-slate-300">
          All {cycle.evaluation.checks.length} synthetic checks pass, but the
          disposition remains {cycle.evaluation.disposition} because human review is
          {" "}{cycle.evaluation.humanReview}. Live production evidence is unavailable;
          deployment remains unauthorized.
        </p>
        <p className="mt-3 break-all font-mono text-xs">experiment {artifact.artifactHash}</p>
        <p className="mt-1 break-all font-mono text-xs">cycle {cycle.evidenceHash}</p>
      </section>
      <details className="rounded-2xl border border-slate-200 p-5" open>
        <summary className="cursor-pointer font-semibold">Inspect regression gates</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th>Metric</th><th>Baseline</th><th>Candidate</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>
              {cycle.evaluation.checks.map((check) => (
                <tr key={check.metricId} className="border-t border-slate-200">
                  <td className="py-2">{check.metricId}</td>
                  <td>{check.baseline ?? "missing"}</td>
                  <td>{check.candidate ?? "missing"}</td>
                  <td>{check.status}</td>
                  <td>{check.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="rounded-2xl border border-slate-200 p-5">
        <summary className="cursor-pointer font-semibold">Inspect per-case outcomes</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th>Case</th><th>Baseline</th><th>Candidate</th><th>Evidence</th></tr></thead>
            <tbody>
              {artifact.executions.baseline.outcomes.map((outcome, index) => (
                <tr key={outcome.caseId} className="border-t border-slate-200">
                  <td className="py-2">{outcome.caseId}</td>
                  <td>{String(outcome.observations.taskSuccess?.value)}</td>
                  <td>{String(artifact.executions.candidate.outcomes[index].observations.taskSuccess?.value)}</td>
                  <td>{outcome.observations.taskSuccess?.evidenceClass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {opsUrl ? (
        <a className="inline-flex rounded-full bg-blue-600 px-5 py-3 font-semibold text-white" href={opsUrl} target="_blank" rel="noreferrer">
          Inspect recorded cycles in Ops Console
        </a>
      ) : (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The public Ops Console URL is not configured for this deployment.
        </p>
      )}
    </main>
  );
}
