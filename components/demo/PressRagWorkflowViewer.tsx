"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { PressRagExecutionIdentityStrip } from "@/components/demo/PressRagExecutionIdentityStrip";
import { PressRagStageComparison } from "@/components/demo/PressRagStageComparison";
import { PressRagWorkflowSandboxPanel } from "@/components/demo/PressRagWorkflowSandboxPanel";
import { PressRagWorkflowVerdictHeader } from "@/components/demo/PressRagWorkflowVerdictHeader";
import { EDGE_TRAVERSAL_COPY, PRESS_RAG_EDITABLE_FIELD_COPY, STATUS_COPY, StatusChip, VERDICT_COPY, VerdictChip } from "@/components/demo/pressRagWorkflowCopy";
import type { PressRagDemoViewModel, PressRagRecordedOutcome } from "@/domain/evaluation/pressRagDemoPresenter";
import { PRESS_RAG_GUARDRAIL_IDS, type PressRagGuardrailResult } from "@/domain/evaluation/pressRagGuardrails";
import { projectPressRagWorkflowComparison } from "@/domain/evaluation/pressRagWorkflowComparison";
import { resolvePressRagWorkflowNavigationIndex } from "@/domain/evaluation/pressRagWorkflowNavigation";
import {
  PRESS_RAG_STAGE_OWNED_FIELDS,
  createPressRagStageDraft,
  projectRecordedPressRagSandbox,
  runPressRagSandbox,
  validatePressRagStageDraft,
  type PressRagSandboxProjection,
  type PressRagSandboxValidationError,
  type PressRagStageDraft,
} from "@/domain/evaluation/pressRagWorkflowSandbox";
import type { PressRagWorkflowInspection, PressRagWorkflowNodeId } from "@/domain/evaluation/pressRagWorkflowView";

type Configuration = "baseline" | "candidate";
type Expectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
type ArtifactEvidence = PressRagDemoViewModel["evidence"]["baseline"] | PressRagDemoViewModel["evidence"]["candidate"];
type DraftEntry = Readonly<{ draft: PressRagStageDraft; dirty: boolean }>;
type DraftMap = Partial<Record<PressRagWorkflowNodeId, DraftEntry>>;

const START_STAGE: PressRagWorkflowNodeId = "request-intake";

function GuardrailBody({ result }: { result: PressRagGuardrailResult }) {
  return <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
    {([["기대", result.expected], ["관측", result.observed], ["판정 이유", result.reason]] as const).map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-border bg-background p-2.5"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-xs">{value}</dd></div>)}
  </dl>;
}

function GuardrailLane({ result }: { result: PressRagGuardrailResult }) {
  return <article className="grid min-w-0 gap-2 rounded-xl border border-border bg-card p-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-black">{result.label}</h5><VerdictChip verdict={result.verdict} /></div>
    <p className="text-xs text-muted-foreground">{result.gate ? <strong className="text-primary">전이 조건 · </strong> : null}{result.rule}</p>
    <GuardrailBody result={result} />
  </article>;
}

function Inspection({ inspection }: { inspection: PressRagWorkflowInspection }) {
  const groups = [["입력", inspection.input], ["근거", inspection.evidence], ["결정", inspection.decisions], ["출력", inspection.output]] as const;
  return <section className="grid min-w-0 gap-2 rounded-xl border border-border bg-card p-3" aria-label="선택 단계 검사">
    <h3 className="text-sm font-black">선택 단계 검사</h3>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">{groups.map(([label, rows]) => <div key={label} className="min-w-0 rounded-lg border border-border bg-background p-3"><h4 className="text-xs font-black text-primary">{label}</h4><dl className="mt-2 grid gap-2">{rows.map((row) => <div key={row.key} className="min-w-0"><dt className="font-mono text-[9px] text-muted-foreground">{row.label}</dt><dd className="break-words text-xs leading-5">{row.value}</dd></div>)}</dl></div>)}</div>
  </section>;
}

export function PressRagWorkflowViewer({
  baseline, candidate, expectation, prompt, scenarioLabel, caseId, partition, repetitionCount,
  baselineEvidence, candidateEvidence,
}: {
  baseline: PressRagRecordedOutcome;
  candidate: PressRagRecordedOutcome;
  expectation: Expectation;
  prompt: string;
  scenarioLabel: string;
  caseId: string;
  partition: string;
  repetitionCount: number;
  baselineEvidence: ArtifactEvidence;
  candidateEvidence: ArtifactEvidence;
}) {
  const [configuration, setConfiguration] = useState<Configuration>("candidate");
  const recordedOutcome = configuration === "baseline" ? baseline : candidate;
  const artifact = configuration === "baseline" ? baselineEvidence : candidateEvidence;
  const recorded = useMemo(() => projectRecordedPressRagSandbox(recordedOutcome, expectation, prompt), [recordedOutcome, expectation, prompt]);
  const [testResult, setTestResult] = useState<PressRagSandboxProjection | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<PressRagWorkflowNodeId>(START_STAGE);
  const [drafts, setDrafts] = useState<DraftMap>(() => ({ [START_STAGE]: { draft: createPressRagStageDraft(START_STAGE, prompt, candidate, expectation), dirty: false } }));
  const [runErrors, setRunErrors] = useState<readonly PressRagSandboxValidationError[]>([]);
  const [runReport, setRunReport] = useState<string | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cumulative = testResult ?? recorded;
  const selectedRecordedNode = recorded.workflow.nodes.find(({ id }) => id === selectedStageId) ?? recorded.workflow.nodes[0]!;
  const selectedCurrentNode = cumulative.workflow.nodes.find(({ id }) => id === selectedStageId) ?? cumulative.workflow.nodes[0]!;
  const draft = drafts[selectedStageId]?.draft ?? createPressRagStageDraft(selectedStageId, cumulative.prompt, cumulative.outcome, expectation);
  const errors = validatePressRagStageDraft(draft);
  const editedStages = Object.entries(drafts).filter(([, entry]) => entry?.dirty).map(([id]) => id as PressRagWorkflowNodeId);
  const comparison = projectPressRagWorkflowComparison(recorded, testResult, selectedStageId);
  const results = cumulative.guardrails.byNode[selectedStageId] ?? [];

  function seed(id: PressRagWorkflowNodeId, source: PressRagSandboxProjection, previous: DraftMap): DraftMap {
    if (previous[id]) return previous;
    return { ...previous, [id]: { draft: createPressRagStageDraft(id, source.prompt, source.outcome, expectation), dirty: false } };
  }

  function reset(nextConfiguration = configuration) {
    const next = nextConfiguration === "baseline" ? baseline : candidate;
    setTestResult(null);
    setRunErrors([]);
    setRunReport(null);
    setSelectedStageId(START_STAGE);
    setDrafts({ [START_STAGE]: { draft: createPressRagStageDraft(START_STAGE, prompt, next, expectation), dirty: false } });
  }

  function selectConfiguration(next: Configuration) {
    setConfiguration(next);
    reset(next);
  }

  function selectStage(id: PressRagWorkflowNodeId) {
    setSelectedStageId(id);
    setDrafts((previous) => seed(id, cumulative, previous));
  }

  function moveToNode(index: number) {
    const node = recorded.workflow.nodes[index];
    if (!node) return;
    selectStage(node.id);
    buttonRefs.current[index]?.focus();
  }

  function selectNode(id: PressRagWorkflowNodeId) {
    const index = recorded.workflow.nodes.findIndex((node) => node.id === id);
    if (index >= 0) moveToNode(index);
  }

  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = resolvePressRagWorkflowNavigationIndex(event.key, index, recorded.workflow.nodes.length);
    if (next === index) return;
    event.preventDefault();
    moveToNode(next);
  }

  function run() {
    const result = runPressRagSandbox({ recordedOutcome, expectation, prompt, draft, current: testResult });
    if (!result.ok) {
      setRunErrors(result.errors);
      setRunReport(null);
      return;
    }
    setRunErrors([]);
    setTestResult(result.result);
    setRunReport("로컬 판정을 계산했습니다.");
    setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([, entry]) => entry?.dirty)) as DraftMap);
  }

  return <section className="pt-no-glow mt-4 grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-5" aria-label="RAG 단계 워크벤치">
    <PressRagExecutionIdentityStrip scenarioLabel={scenarioLabel} caseId={caseId} partition={partition} repetitionIndex={recordedOutcome.runIndex} repetitionCount={repetitionCount} configuration={configuration} baselineEvidence={baselineEvidence} candidateEvidence={candidateEvidence} onConfigurationChange={selectConfiguration} />

    <PressRagWorkflowVerdictHeader recordedWorkflow={recorded.workflow} testedWorkflow={testResult?.workflow ?? null} recordedOutcome={recordedOutcome} onSelectNode={selectNode} />

    <nav aria-label="워크플로 7단계" className="min-w-0">
      <ol className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-7">
        {recorded.workflow.nodes.map((node, index) => {
          const testedNode = testResult?.workflow.nodes.find(({ id }) => id === node.id) ?? null;
          const selected = node.id === selectedStageId;
          const edited = drafts[node.id]?.dirty === true;
          return <li key={node.id} className="min-w-0"><button ref={(element) => { buttonRefs.current[index] = element; }} type="button" tabIndex={selected ? 0 : -1} aria-current={selected ? "step" : undefined} aria-label={`${index + 1}단계 ${node.label}: 기록 ${STATUS_COPY[node.status].label}${testedNode ? `, 테스트 ${STATUS_COPY[testedNode.status].label}` : ""}`} onClick={() => selectStage(node.id)} onKeyDown={(event) => handleNodeKeyDown(event, index)} className={`flex h-full min-h-28 w-full min-w-0 flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
            <span className="flex w-full items-center justify-between font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}{edited ? <span className="rounded bg-primary/15 px-1 font-sans font-black text-primary">편집됨</span> : null}</span>
            <span className="break-words text-xs font-black leading-tight">{node.label}</span>
            <span className="text-[10px] font-bold text-muted-foreground">기록</span><StatusChip status={node.status} />
            {testedNode ? <><span className="text-[10px] font-bold text-muted-foreground">테스트</span><StatusChip status={testedNode.status} /></> : null}
          </button></li>;
        })}
      </ol>
    </nav>

    {runReport ? <p aria-live="polite" className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-black">{runReport}</p> : null}

    <PressRagStageComparison comparison={comparison} stageLabel={selectedRecordedNode.label} />

    <div className="grid min-w-0 gap-3 lg:grid-cols-2 lg:items-start">
      <Inspection inspection={selectedCurrentNode.inspection} />
      <PressRagWorkflowSandboxPanel stageLabel={selectedRecordedNode.label} editableFields={PRESS_RAG_STAGE_OWNED_FIELDS[selectedStageId].map((field) => PRESS_RAG_EDITABLE_FIELD_COPY[field] ?? field)} draft={draft} errors={errors} runErrors={runErrors} editedStages={editedStages} recorded={recorded} tested={testResult} onChange={(next) => setDrafts((previous) => ({ ...previous, [next.stageId]: { draft: next, dirty: true } }))} onRun={run} onReset={() => reset()} />
    </div>

    <details className="min-w-0 rounded-xl border border-border bg-muted/30">
      <summary className="cursor-pointer p-3 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">선택 단계 전이와 가드레일 상세</summary>
      <div className="grid min-w-0 gap-4 p-3 pt-0">
        <section aria-label="선택 단계 소유 전이" className="grid min-w-0 gap-2">
          <h4 className="text-xs font-black">{selectedRecordedNode.label}에서 나가는 전이</h4>
          {comparison.transitions.length ? comparison.transitions.map((transition) => <article key={transition.id} className="grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3 text-xs">
            <p className="font-black">전이 조건 · {transition.condition}</p>
            <div className="flex flex-wrap gap-2"><strong>기록 진행</strong><span>{EDGE_TRAVERSAL_COPY[transition.recorded.traversal]}</span><strong>기록 전이 규칙</strong><VerdictChip verdict={transition.recorded.gateVerdict} /></div>
            {transition.tested ? <div className="flex flex-wrap gap-2"><strong>테스트 진행</strong><span>{EDGE_TRAVERSAL_COPY[transition.tested.traversal]}</span><strong>테스트 전이 규칙</strong><VerdictChip verdict={transition.tested.gateVerdict} /></div> : null}
          </article>) : <p className="text-xs text-muted-foreground">이 단계에서 나가는 전이가 없습니다.</p>}
        </section>
        <section className="grid min-w-0 gap-2" aria-label={`가드레일 ${PRESS_RAG_GUARDRAIL_IDS.length}개`}><h4 className="text-xs font-black">가드레일 5개 · 테스트가 있으면 누적 테스트 기준</h4>{[...results].sort((a, b) => VERDICT_COPY[a.verdict].rank - VERDICT_COPY[b.verdict].rank).map((result) => <GuardrailLane key={result.guardrailId} result={result} />)}</section>
      </div>
    </details>

    <details className="min-w-0 rounded-xl border border-border bg-muted/30">
      <summary className="cursor-pointer p-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">선택 기록 provenance · hashes와 안전한 참조</summary>
      <div className="grid gap-2 px-3 pb-3 text-xs"><p className="break-all font-mono">configuration hash · {artifact.configurationHash}</p><p className="break-all font-mono">기록 실행 참조 · {recordedOutcome.recordedExecutionRef}</p></div>
    </details>
  </section>;
}
