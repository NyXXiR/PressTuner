"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { PressRagWorkflowSandboxPanel } from "@/components/demo/PressRagWorkflowSandboxPanel";
import type { PressRagDemoViewModel, PressRagRecordedOutcome } from "@/domain/evaluation/pressRagDemoPresenter";
import { PRESS_RAG_GUARDRAIL_IDS, rollUpGuardrails, type PressRagGuardrailResult, type PressRagGuardrailVerdict } from "@/domain/evaluation/pressRagGuardrails";
import { resolvePressRagWorkflowNavigationIndex } from "@/domain/evaluation/pressRagWorkflowNavigation";
import {
  createPressRagStageDraft,
  projectRecordedPressRagSandbox,
  resolvePressRagSandboxStageId,
  runPressRagSandbox,
  validatePressRagStageDraft,
  type PressRagSandboxProjection,
  type PressRagSandboxSelection,
  type PressRagStageDraft,
} from "@/domain/evaluation/pressRagWorkflowSandbox";
import type { PressRagWorkflowInspection, PressRagWorkflowStatus } from "@/domain/evaluation/pressRagWorkflowView";

type Configuration = "baseline" | "candidate";
type Expectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
type ArtifactEvidence = PressRagDemoViewModel["evidence"]["baseline"] | PressRagDemoViewModel["evidence"]["candidate"];

const VERDICT_COPY: Readonly<Record<PressRagGuardrailVerdict, { icon: string; label: string; tone: string; stripe: string }>> = {
  PASS: { icon: "✓", label: "지킴", tone: "border-emerald-500/45 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100", stripe: "bg-emerald-500" },
  VIOLATION: { icon: "×", label: "위반", tone: "border-rose-500/50 bg-rose-500/12 text-rose-900 dark:text-rose-100", stripe: "bg-rose-500" },
  NOT_EVALUABLE: { icon: "?", label: "평가 불가", tone: "border-amber-500/45 bg-amber-500/12 text-amber-900 dark:text-amber-100", stripe: "bg-amber-500" },
  NOT_APPLICABLE: { icon: "–", label: "해당 없음", tone: "border-border bg-muted text-muted-foreground", stripe: "bg-border" },
};
const STATE_COPY: Readonly<Record<PressRagWorkflowStatus, string>> = { RECORDED: "기록됨", MATCH: "기대와 일치", MISMATCH: "불일치", FAILED: "실패 기록", NOT_EVALUABLE: "평가 불가", SKIPPED: "건너뜀" };
function VerdictChip({ verdict, text }: { verdict: PressRagGuardrailVerdict; text?: string }) {
  const copy = VERDICT_COPY[verdict];
  return <span role="status" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black ${copy.tone}`}><span aria-hidden="true">{copy.icon}</span>{text ?? copy.label}</span>;
}

function GuardrailLane({ result }: { result: PressRagGuardrailResult }) {
  const copy = VERDICT_COPY[result.verdict];
  return <article className="grid min-w-0 grid-cols-[4px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card"><div aria-hidden="true" className={copy.stripe} /><div className="flex min-w-0 flex-col gap-2 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black">{result.label}</h4><VerdictChip verdict={result.verdict} /></div><p className="text-xs leading-5 text-muted-foreground">{result.gate ? <span className="font-bold text-primary">전이 조건 · </span> : null}{result.rule}</p><dl className="grid min-w-0 gap-2 sm:grid-cols-3">{([ ["기대", result.expected], ["관측", result.observed], ["판정 이유", result.reason] ] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-border/80 bg-background/70 p-2.5"><dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-xs leading-5">{value}</dd></div>)}</dl></div></article>;
}

function Inspection({ inspection }: { inspection: PressRagWorkflowInspection }) {
  const groups = [["입력", inspection.input], ["근거", inspection.evidence], ["결정", inspection.decisions], ["출력", inspection.output]] as const;
  return <section className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="입력 근거 결정 출력 검사">{groups.map(([label, rows]) => <div key={label} className="min-w-0 rounded-xl border border-border bg-background p-3"><h3 className="text-xs font-black text-primary">{label}</h3><dl className="mt-2 grid gap-2">{rows.map((row) => <div key={row.key} className="min-w-0"><dt className="font-mono text-[9px] text-muted-foreground">{row.label}</dt><dd className="break-words text-xs leading-5">{row.value}</dd></div>)}</dl></div>)}</section>;
}

function kst(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value));
}

export function PressRagWorkflowViewer({
  baseline, candidate, expectation, prompt, caseId, repetitionCount, baselineEvidence, candidateEvidence,
}: {
  baseline: PressRagRecordedOutcome;
  candidate: PressRagRecordedOutcome;
  expectation: Expectation;
  prompt: string;
  caseId: string;
  repetitionCount: number;
  baselineEvidence: ArtifactEvidence;
  candidateEvidence: ArtifactEvidence;
}) {
  const [configuration, setConfiguration] = useState<Configuration>("candidate");
  const recordedOutcome = configuration === "baseline" ? baseline : candidate;
  const artifact = configuration === "baseline" ? baselineEvidence : candidateEvidence;
  const recorded = useMemo(() => projectRecordedPressRagSandbox(recordedOutcome, expectation, prompt), [recordedOutcome, expectation, prompt]);
  const [mode, setMode] = useState<"recorded" | "test">("recorded");
  const [testResult, setTestResult] = useState<PressRagSandboxProjection | null>(null);
  const [selection, setSelectionState] = useState<PressRagSandboxSelection>({ kind: "node", id: "retrieval-execution" });
  const [draft, setDraft] = useState<PressRagStageDraft>(() => createPressRagStageDraft("retrieval-execution", prompt, candidate, expectation));
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const projection = mode === "test" && testResult ? testResult : recorded;
  const { workflow, guardrails } = projection;
  const errors = validatePressRagStageDraft(draft);
  const selectedNode = selection.kind === "node" ? workflow.nodes.find(({ id }) => id === selection.id) ?? workflow.nodes[0]! : null;
  const selectedEdge = selection.kind === "edge" ? workflow.edges.find(({ id }) => id === selection.id) ?? null : null;
  const results = selection.kind === "node" ? guardrails.byNode[selection.id] ?? [] : guardrails.byEdge[selection.id] ?? [];
  const inspection = selectedNode?.inspection ?? selectedEdge?.inspection ?? workflow.nodes[0]!.inspection;
  const nodeIndex = selectedNode ? workflow.nodes.findIndex(({ id }) => id === selectedNode.id) : -1;

  function reset(nextConfiguration = configuration) {
    const next = nextConfiguration === "baseline" ? baseline : candidate;
    setMode("recorded"); setTestResult(null); setSelectionState({ kind: "node", id: "retrieval-execution" });
    setDraft(createPressRagStageDraft("retrieval-execution", prompt, next, expectation));
  }
  function selectConfiguration(next: Configuration) { setConfiguration(next); reset(next); }
  function select(selection: PressRagSandboxSelection) {
    setSelectionState(selection);
    const stageId = resolvePressRagSandboxStageId(selection, workflow);
    setDraft(createPressRagStageDraft(stageId, projection.prompt, projection.outcome, expectation));
  }
  function moveToNode(index: number) {
    const node = workflow.nodes[index]; if (!node) return; select({ kind: "node", id: node.id });
    buttonRefs.current[index]?.focus(); buttonRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = resolvePressRagWorkflowNavigationIndex(event.key, index, workflow.nodes.length); if (next === index) return;
    event.preventDefault(); moveToNode(next);
  }
  function run() {
    const result = runPressRagSandbox({ recordedOutcome, expectation, prompt, draft, current: testResult });
    if (!result.ok) return;
    setTestResult(result.result); setMode("test");
  }

  return <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="workflow-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="workflow-heading" className="text-sm font-black">상태 전이 그래프</h2><div className="flex flex-wrap gap-2"><div className="grid grid-cols-2 gap-1" role="group" aria-label="기록/테스트 모드">{(["recorded", "test"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${mode === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{value === "recorded" ? "기록 모드" : "테스트 모드"}</button>)}</div><div className="grid grid-cols-2 gap-1" role="group" aria-label="워크플로 구성 선택">{([ ["baseline", baselineEvidence.label], ["candidate", candidateEvidence.label] ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={configuration === id} onClick={() => selectConfiguration(id)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${configuration === id ? "border-primary bg-primary/10" : "border-border bg-background"}`}>{label}</button>)}</div></div></div>

    <section className="mt-3 rounded-xl border border-border bg-muted/35 p-3" aria-label="선택 기록 출처"><p className="text-xs font-black">{artifact.artifact} · {artifact.label}</p><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">configuration hash {artifact.configurationHash}</p><dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-bold text-muted-foreground">아티팩트 실행 시작</dt><dd><time dateTime={artifact.startedAt}>{artifact.startedAt}</time><br />KST · {kst(artifact.startedAt)}</dd></div><div><dt className="font-bold text-muted-foreground">아티팩트 실행 완료</dt><dd><time dateTime={artifact.completedAt}>{artifact.completedAt}</time><br />KST · {kst(artifact.completedAt)}</dd></div></dl><p className="mt-2 text-xs text-muted-foreground">위 시간은 개별 반복의 시간이 아니라 아티팩트 실행 window입니다. {caseId}의 repetition {recordedOutcome.runIndex} of {repetitionCount}은 선택 아티팩트 안의 실행 인덱스를 뜻합니다.</p><p className="mt-1 break-all font-mono text-[10px]">안전한 기록 실행 참조 · {recordedOutcome.recordedExecutionRef}</p></section>

    <nav className="mt-3" aria-label="워크플로 노드와 엣지"><ol className="flex min-w-0 flex-wrap items-stretch gap-y-2">{workflow.nodes.flatMap((node, index) => {
      const verdict = rollUpGuardrails(guardrails.byNode[node.id] ?? []); const isSelected = selection.kind === "node" && selection.id === node.id;
      const items = [<li key={node.id} className="w-full min-w-0 shrink-0 sm:w-[10.5rem]"><button ref={(element) => { buttonRefs.current[index] = element; }} type="button" tabIndex={isSelected ? 0 : -1} aria-current={isSelected ? "step" : undefined} aria-controls="guardrail-panel" aria-label={`${node.label}: ${STATE_COPY[node.status]}`} onClick={() => select({ kind: "node", id: node.id })} onKeyDown={(event) => handleNodeKeyDown(event, index)} className={`flex h-full w-full flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? "border-primary bg-primary/10" : "border-border bg-background"}`}><span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")} · {node.status}</span><span className="break-words text-[12.5px] font-black">{node.label}</span><VerdictChip verdict={verdict} /></button></li>];
      const edge = workflow.edges[index]; if (edge) { const edgeVerdict = rollUpGuardrails(guardrails.byEdge[edge.id] ?? []); const edgeSelected = selection.kind === "edge" && selection.id === edge.id; items.push(<li key={edge.id} className="w-full min-w-0 shrink-0 sm:w-[6.5rem]"><button type="button" aria-pressed={edgeSelected} aria-controls="guardrail-panel" onClick={() => select({ kind: "edge", id: edge.id })} className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-2 text-center focus-visible:ring-2 focus-visible:ring-primary ${edgeSelected ? "border-primary bg-primary/10" : "border-border"}`}><span aria-hidden="true">→</span><span className="break-words text-[10.5px] font-bold">{edge.decisionLabel}</span><span className="text-[10px] text-muted-foreground">traversal {edge.state}</span><VerdictChip verdict={edgeVerdict} text={`gate ${VERDICT_COPY[edgeVerdict].label}`} /></button></li>); } return items;
    })}</ol></nav>

    <div id="guardrail-panel" className="mt-4 min-w-0"><div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-live="polite"><p><span className="font-mono text-[10px] font-bold uppercase text-primary">{selection.kind === "node" ? "선택한 노드" : "선택한 엣지"}</span><span className="ml-2 text-sm font-black">{selectedNode?.label ?? selectedEdge?.decisionLabel}</span></p><p className="font-mono text-[11px] text-muted-foreground">가드레일 {PRESS_RAG_GUARDRAIL_IDS.length}개 · 위반 {results.filter(({ verdict }) => verdict === "VIOLATION").length}</p></div><Inspection inspection={inspection} /><div className="mt-3 grid min-w-0 gap-2.5">{results.map((result) => <GuardrailLane key={result.guardrailId} result={result} />)}</div>
      <PressRagWorkflowSandboxPanel draft={draft} errors={errors} recorded={recorded} tested={testResult} onChange={setDraft} onRun={run} onReset={() => reset()} />
      {selection.kind === "node" ? <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="노드 이동"><button type="button" disabled={nodeIndex <= 0} onClick={() => moveToNode(nodeIndex - 1)} className="min-h-11 rounded-lg border border-border disabled:opacity-40">← 이전 상태</button><button type="button" disabled={nodeIndex === workflow.nodes.length - 1} onClick={() => moveToNode(nodeIndex + 1)} className="min-h-11 rounded-lg bg-primary text-primary-foreground disabled:opacity-40">다음 상태 →</button></div> : null}
    </div>
  </section>;
}
