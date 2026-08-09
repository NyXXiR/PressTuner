"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProducerVerificationReport } from "@/domain/press-ai-debugger/producerVerification";
import { fetchPressAiProducerVerification } from "@/lib/pressAiProcessDebuggerClient";

const statusTone = (status: string) => status === "verified" || status === "ready" || status === "observed" || status === "linked"
  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  : status === "disabled" || status === "not_observed" || status === "empty"
    ? "border-slate-500/40 bg-slate-500/10 text-muted-foreground"
    : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";

function Status({ value }: { value: string }) { return <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusTone(value)}`}>{value}</span>; }
function Metric({ label, value }: { label: string; value: string | number | boolean }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold">{typeof value === "boolean" ? (value ? "yes" : "no") : value}</dd></div>; }
function DeliveryMetric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1"><Status value={value} /></dd></div>; }

export function PressAiProducerVerificationPanel({ attemptId, revision }: { attemptId: string; revision: number }) {
  const [report, setReport] = useState<ProducerVerificationReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const load = useCallback(() => fetchPressAiProducerVerification(attemptId), [attemptId]);
  const refresh = useCallback(async () => {
    setState("loading");
    try { setReport(await load()); setState("ready"); }
    catch { setReport(null); setState("failed"); }
  }, [load]);
  useEffect(() => {
    let active = true;
    void load().then((verification) => { if (active) { setReport(verification); setState("ready"); } }).catch(() => { if (active) { setReport(null); setState("failed"); } });
    return () => { active = false; };
  }, [load, revision]);
  return <section className="mb-4 rounded-xl border border-border p-4" aria-labelledby="producer-verification-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="producer-verification-heading" className="font-black">Producer protocol verification</h3><p className="mt-1 text-xs text-muted-foreground">Read-only local projection evidence. Delivery success is never inferred.</p></div><button type="button" onClick={() => void refresh()} disabled={state === "loading"} className="min-h-9 rounded-lg border px-3 text-xs font-bold disabled:opacity-50">Refresh verification</button></div>
    {state === "loading" ? <p role="status" className="mt-3 text-sm text-muted-foreground">Loading verification…</p> : null}
    {state === "failed" ? <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">Verification is unavailable.</p> : null}
    {report ? <div className="mt-4 space-y-4">
      <div><h4 className="text-sm font-black">Manifest</h4><div className="mt-2"><Status value={report.manifest.status} /></div><dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Protocol version" value={report.manifest.protocolVersion} /><Metric label="SDK version" value={report.manifest.sdkVersion} /><Metric label="Workflow" value={report.manifest.workflowId} /><Metric label="Workflow version" value={report.manifest.workflowVersion} /><Metric label="Definition hash" value={report.manifest.definitionHash} /><Metric label="Stored registry hash" value={report.manifest.storedRegistryHash} /><Metric label="Registry matches" value={report.manifest.registryMatches} /><Metric label="Stages / edges / gates" value={`${report.manifest.stageCount} / ${report.manifest.edgeCount} / ${report.manifest.gateCount}`} /></dl></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div><h4 className="text-sm font-black">Canonical</h4><div className="mt-2"><Status value={report.canonical.status} /></div><dl className="mt-2 grid grid-cols-2 gap-2"><Metric label="Total" value={report.canonical.totalCount} /><Metric label="Run lifecycle" value={report.canonical.counts["run.lifecycle"]} /><Metric label="Span lifecycle" value={report.canonical.counts["span.lifecycle"]} /><Metric label="Evaluations" value={report.canonical.counts["transition.evaluation"]} /><Metric label="Approvals" value={report.canonical.counts["human.approval"]} /><Metric label="Edges" value={report.canonical.counts["edge.traversed"]} /><Metric label="Dataset captures" value={report.canonical.counts["dataset.item.captured"]} /><Metric label="Replays" value={report.canonical.counts["replay.started"]} /><Metric label="Experiments" value={report.canonical.counts["experiment.outcome"]} /><Metric label="Regressions" value={report.canonical.counts["regression.outcome"]} /></dl></div>
        <div><h4 className="text-sm font-black">Facts</h4><div className="mt-2"><Status value={report.facts.status} /></div><dl className="mt-2 grid grid-cols-2 gap-2"><Metric label="Facts" value={report.facts.factCount} /><Metric label="Batches" value={report.facts.batchCount} /><Metric label="Node lifecycle" value={report.facts.counts["node.lifecycle"]} /><Metric label="Edge traversal" value={report.facts.counts["edge.traversal"]} /><Metric label="Human review" value={report.facts.counts["human.review"]} /><Metric label="Deterministic IDs" value={report.facts.deterministicIds} /><Metric label="Replay safe" value={report.facts.replaySafe} /></dl></div>
        <div><h4 className="text-sm font-black">Content-free OTLP</h4><div className="mt-2"><Status value={report.otlp.status} /></div><dl className="mt-2 grid grid-cols-2 gap-2"><Metric label="Content free" value={report.otlp.contentFree} /><Metric label="Aggregate spans" value={report.otlp.spanCount} /><Metric label="Requests" value={report.otlp.requestCount} /></dl></div>
      </div>
      <div><h4 className="text-sm font-black">External delivery evidence</h4><dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><DeliveryMetric label="Operation configuration" value={report.delivery.operationConfiguration} /><DeliveryMetric label="OTLP configuration" value={report.delivery.otlpConfiguration} /><DeliveryMetric label="Operation linkage" value={report.delivery.operationLinkage} /><DeliveryMetric label="Fact delivery" value={report.delivery.factDelivery} /><DeliveryMetric label="OTLP delivery" value={report.delivery.otlpDelivery} /><DeliveryMetric label="Completion delivery" value={report.delivery.completionDelivery} /></dl></div>
      <div><h4 className="text-sm font-black">Replay summary</h4><dl className="mt-2 grid gap-3 sm:grid-cols-4"><Metric label="Canonical count" value={report.replay.canonicalCount} /><Metric label="Unique deterministic facts" value={report.replay.uniqueDeterministicFactCount} /><Metric label="Aggregate spans" value={report.replay.aggregateSpanCount} /><Metric label="Replay safe" value={report.replay.replaySafe} /></dl></div>
    </div> : null}
  </section>;
}
