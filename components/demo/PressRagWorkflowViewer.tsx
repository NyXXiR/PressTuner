"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { PressRagWorkflowSandboxPanel } from "@/components/demo/PressRagWorkflowSandboxPanel";
import { PressRagWorkflowVerdictHeader } from "@/components/demo/PressRagWorkflowVerdictHeader";
import { STATUS_COPY, StatusChip, VERDICT_COPY, VerdictChip, isBrokenStatus } from "@/components/demo/pressRagWorkflowCopy";
import type { PressRagDemoViewModel, PressRagRecordedOutcome } from "@/domain/evaluation/pressRagDemoPresenter";
import { PRESS_RAG_GUARDRAIL_IDS, rollUpGuardrails, type PressRagGuardrailResult } from "@/domain/evaluation/pressRagGuardrails";
import { resolvePressRagWorkflowNavigationIndex } from "@/domain/evaluation/pressRagWorkflowNavigation";
import {
  createPressRagStageDraft,
  projectRecordedPressRagSandbox,
  resolvePressRagSandboxStageId,
  runPressRagSandbox,
  validatePressRagStageDraft,
  type PressRagSandboxProjection,
  type PressRagSandboxSelection,
  type PressRagSandboxValidationError,
  type PressRagStageDraft,
} from "@/domain/evaluation/pressRagWorkflowSandbox";
import type { PressRagWorkflowInspection, PressRagWorkflowNodeId } from "@/domain/evaluation/pressRagWorkflowView";

type Configuration = "baseline" | "candidate";
type Expectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
type ArtifactEvidence = PressRagDemoViewModel["evidence"]["baseline"] | PressRagDemoViewModel["evidence"]["candidate"];
/** A draft the reader edited by hand survives navigation; a seeded one may be re-derived. */
type DraftEntry = Readonly<{ draft: PressRagStageDraft; dirty: boolean }>;
type DraftMap = Partial<Record<PressRagWorkflowNodeId, DraftEntry>>;
type RunReport = Readonly<{ stageLabel: string; before: string; after: string; changed: boolean }>;

const START_STAGE: PressRagWorkflowNodeId = "retrieval-execution";

function GuardrailBody({ result }: { result: PressRagGuardrailResult }) {
  return (
    <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
      {([["기대", result.expected], ["관측", result.observed], ["판정 이유", result.reason]] as const).map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg border border-border/80 bg-background/70 p-2.5">
          <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-xs leading-5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GuardrailLane({ result, open }: { result: PressRagGuardrailResult; open: boolean }) {
  const copy = VERDICT_COPY[result.verdict];
  const heading = (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h4 className="min-w-0 break-words text-sm font-black">{result.label}</h4>
      <VerdictChip verdict={result.verdict} />
    </div>
  );
  const rule = (
    <p className="text-xs leading-5 text-muted-foreground">
      {result.gate ? <span className="font-bold text-primary">전이 조건 · </span> : null}
      {result.rule}
    </p>
  );
  return (
    <article className="grid min-w-0 grid-cols-[4px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card">
      <div aria-hidden="true" className={copy.stripe} />
      {open ? (
        <div className="flex min-w-0 flex-col gap-2 p-3 sm:p-4">
          {heading}
          {rule}
          <GuardrailBody result={result} />
        </div>
      ) : (
        <details className="min-w-0">
          <summary className="cursor-pointer list-none p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4">
            {heading}
          </summary>
          <div className="flex min-w-0 flex-col gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
            {rule}
            <GuardrailBody result={result} />
          </div>
        </details>
      )}
    </article>
  );
}

function Inspection({ inspection }: { inspection: PressRagWorkflowInspection }) {
  const groups = [["입력", inspection.input], ["근거", inspection.evidence], ["결정", inspection.decisions], ["출력", inspection.output]] as const;
  return (
    <section className="grid min-w-0 gap-2 sm:grid-cols-2" aria-label="입력 근거 결정 출력 검사">
      {groups.map(([label, rows]) => (
        <div key={label} className="min-w-0 rounded-xl border border-border bg-background p-3">
          <h3 className="text-xs font-black text-primary">{label}</h3>
          <dl className="mt-2 grid gap-2">
            {rows.map((row) => (
              <div key={row.key} className="min-w-0">
                <dt className="font-mono text-[9px] text-muted-foreground">{row.label}</dt>
                <dd className="break-words text-xs leading-5">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
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
  const [selection, setSelectionState] = useState<PressRagSandboxSelection>({ kind: "node", id: START_STAGE });
  const [drafts, setDrafts] = useState<DraftMap>(() => ({
    [START_STAGE]: { draft: createPressRagStageDraft(START_STAGE, prompt, candidate, expectation), dirty: false },
  }));
  const [runErrors, setRunErrors] = useState<readonly PressRagSandboxValidationError[]>([]);
  const [runReport, setRunReport] = useState<RunReport | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const railRef = useRef<HTMLElement | null>(null);

  const isTest = mode === "test" && testResult !== null;
  const projection = isTest ? testResult : recorded;
  const { workflow, guardrails } = projection;
  const stageId = resolvePressRagSandboxStageId(selection, workflow);
  const draft = drafts[stageId]?.draft ?? createPressRagStageDraft(stageId, projection.prompt, projection.outcome, expectation);
  const errors = validatePressRagStageDraft(draft);
  const selectedNode = selection.kind === "node" ? workflow.nodes.find(({ id }) => id === selection.id) ?? workflow.nodes[0]! : null;
  const selectedEdge = selection.kind === "edge" ? workflow.edges.find(({ id }) => id === selection.id) ?? null : null;
  const results = selection.kind === "node" ? guardrails.byNode[selection.id] ?? [] : guardrails.byEdge[selection.id] ?? [];
  const inspection = selectedNode?.inspection ?? selectedEdge?.inspection ?? workflow.nodes[0]!.inspection;
  const nodeIndex = selectedNode ? workflow.nodes.findIndex(({ id }) => id === selectedNode.id) : -1;
  const firstBrokenId = workflow.nodes.find(({ status }) => isBrokenStatus(status))?.id ?? null;
  const editedStages = Object.entries(drafts).filter(([, entry]) => entry?.dirty).map(([id]) => id as PressRagWorkflowNodeId);

  // Violations first so the reason a stage failed is never below the lanes that held.
  const ranked = [...results].sort((a, b) => VERDICT_COPY[a.verdict].rank - VERDICT_COPY[b.verdict].rank);
  const notable = ranked.filter(({ verdict }) => verdict !== "NOT_APPLICABLE");
  const inapplicable = ranked.filter(({ verdict }) => verdict === "NOT_APPLICABLE");

  function seed(id: PressRagWorkflowNodeId, source: PressRagSandboxProjection, previous: DraftMap): DraftMap {
    if (previous[id]) return previous;
    return { ...previous, [id]: { draft: createPressRagStageDraft(id, source.prompt, source.outcome, expectation), dirty: false } };
  }

  function reset(nextConfiguration = configuration) {
    const next = nextConfiguration === "baseline" ? baseline : candidate;
    setMode("recorded");
    setTestResult(null);
    setRunErrors([]);
    setRunReport(null);
    setSelectionState({ kind: "node", id: START_STAGE });
    setDrafts({ [START_STAGE]: { draft: createPressRagStageDraft(START_STAGE, prompt, next, expectation), dirty: false } });
  }

  function selectConfiguration(next: Configuration) {
    setConfiguration(next);
    reset(next);
  }

  function select(next: PressRagSandboxSelection) {
    setSelectionState(next);
    // Seed a draft only when the stage has none, so hand-edited input survives navigation.
    setDrafts((previous) => seed(resolvePressRagSandboxStageId(next, workflow), projection, previous));
  }

  function selectNode(id: PressRagWorkflowNodeId) {
    const index = workflow.nodes.findIndex((node) => node.id === id);
    if (index < 0) return;
    moveToNode(index);
  }

  function changeDraft(next: PressRagStageDraft) {
    setDrafts((previous) => ({ ...previous, [next.stageId]: { draft: next, dirty: true } }));
  }

  function moveToNode(index: number) {
    const node = workflow.nodes[index];
    if (!node) return;
    select({ kind: "node", id: node.id });
    buttonRefs.current[index]?.focus();
    buttonRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = resolvePressRagWorkflowNavigationIndex(event.key, index, workflow.nodes.length);
    if (next === index) return;
    event.preventDefault();
    moveToNode(next);
  }

  function run() {
    const before = projection.workflow.nodes.at(-1)!.status;
    const result = runPressRagSandbox({ recordedOutcome, expectation, prompt, draft, current: testResult });
    if (!result.ok) {
      setRunErrors(result.errors);
      setRunReport(null);
      return;
    }
    const after = result.result.workflow.nodes.at(-1)!.status;
    setRunErrors([]);
    setTestResult(result.result);
    setMode("test");
    setRunReport({
      stageLabel: workflow.nodes.find(({ id }) => id === draft.stageId)?.label ?? draft.stageId,
      before: STATUS_COPY[before].label,
      after: STATUS_COPY[after].label,
      changed: before !== after,
    });
    // Stages the reader never touched are re-derived from the new projection.
    setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([, entry]) => entry?.dirty)) as DraftMap);
    railRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const toggle = "min-h-10 rounded-lg border px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

  // pt-no-glow: the global `.dark .bg-card` glow sets overflow:hidden, which would make this
  // card a scroll container and strand the sticky verdict header inside it.
  return (
    <section className="pt-no-glow mt-4 min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-5" aria-labelledby="workflow-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="workflow-heading" className="text-sm font-black">상태 전이 그래프</h2>
        <div className="flex flex-wrap gap-2">
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="기록/테스트 표시 전환">
            <button type="button" aria-pressed={!isTest} onClick={() => setMode("recorded")} className={`${toggle} ${!isTest ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
              기록 그대로
            </button>
            <button
              type="button"
              aria-pressed={isTest}
              disabled={testResult === null}
              title={testResult === null ? "먼저 한 단계를 실행하세요." : undefined}
              onClick={() => setMode("test")}
              className={`${toggle} ${isTest ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
            >
              내 테스트 반영
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1" role="group" aria-label="워크플로 구성 선택">
            {([["baseline", baselineEvidence.label], ["candidate", candidateEvidence.label]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={configuration === id} onClick={() => selectConfiguration(id)} className={`${toggle} ${configuration === id ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Verdict and the stage rail stay pinned so an edit's effect is visible while editing. */}
      <div ref={railRef as never} className="mt-3 grid min-w-0 gap-3 bg-[hsl(var(--card))] lg:sticky lg:top-0 lg:z-20 lg:-mx-5 lg:px-5 lg:pb-3 lg:pt-2">
        <PressRagWorkflowVerdictHeader workflow={workflow} recordedWorkflow={recorded.workflow} isTest={isTest} onSelectNode={selectNode} />

        <nav aria-label="워크플로 노드와 엣지" className="min-w-0">
          {/* One column per node with a fixed-width connector between, so all seven stages
              fit the rail at any width instead of wrapping into orphaned arrows. */}
          <ol className="flex min-w-0 flex-col gap-1 md:grid md:grid-cols-[repeat(6,minmax(0,1fr)_1.5rem)_minmax(0,1fr)] md:items-stretch md:gap-0">
            {workflow.nodes.flatMap((node, index) => {
              const violations = (guardrails.byNode[node.id] ?? []).filter(({ verdict }) => verdict === "VIOLATION").length;
              const isSelected = selection.kind === "node" && selection.id === node.id;
              const edited = drafts[node.id]?.dirty === true;
              const items = [(
                <li key={node.id} className="min-w-0">
                  <button
                    ref={(element) => { buttonRefs.current[index] = element; }}
                    type="button"
                    tabIndex={isSelected ? 0 : -1}
                    aria-current={isSelected ? "step" : undefined}
                    aria-controls="guardrail-panel"
                    aria-label={`${index + 1}단계 ${node.label}: ${STATUS_COPY[node.status].label}${violations ? `, 가드레일 위반 ${violations}건` : ""}`}
                    title={`${node.status}${violations ? ` · 가드레일 위반 ${violations}건` : ""}`}
                    onClick={() => select({ kind: "node", id: node.id })}
                    onKeyDown={(event) => handleNodeKeyDown(event, index)}
                    className={`flex h-full w-full flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isSelected ? "border-primary bg-primary/10" : "border-border bg-background"} ${node.id === firstBrokenId ? "ring-2 ring-rose-500/70" : ""}`}
                  >
                    <span className="flex w-full items-center justify-between font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                      {edited ? <span className="rounded bg-primary/15 px-1 font-sans font-black text-primary">편집됨</span> : null}
                    </span>
                    <span className="break-words text-[12.5px] font-black leading-tight">{node.label}</span>
                    {/* Colour follows the stage status; guardrail violations are counted separately
                        so a red dot never sits next to the words "평가 불가". */}
                    <StatusChip status={node.status} />
                    {violations ? <span className="text-[10px] font-bold text-destructive">가드레일 위반 {violations}</span> : null}
                  </button>
                </li>
              )];
              const edge = workflow.edges[index];
              if (edge) {
                const edgeVerdict = rollUpGuardrails(guardrails.byEdge[edge.id] ?? []);
                const edgeSelected = selection.kind === "edge" && selection.id === edge.id;
                items.push(
                  <li key={edge.id} className="min-w-0 md:self-center">
                    <button
                      type="button"
                      aria-pressed={edgeSelected}
                      aria-controls="guardrail-panel"
                      aria-label={`전이 ${edge.decisionLabel}: 통과 ${VERDICT_COPY[edgeVerdict].label}, traversal ${edge.state}`}
                      title={`${edge.decisionLabel} · traversal ${edge.state}`}
                      onClick={() => select({ kind: "edge", id: edge.id })}
                      className={`flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex-col md:gap-0.5 md:border-0 md:py-2 ${edgeSelected ? "border-primary bg-primary/10 md:bg-primary/10" : "border-border"}`}
                    >
                      <span aria-hidden="true" className="rotate-90 text-muted-foreground md:rotate-0">→</span>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${VERDICT_COPY[edgeVerdict].stripe}`} />
                      <span className="text-[10.5px] font-bold text-muted-foreground md:hidden">{edge.decisionLabel}</span>
                    </button>
                  </li>,
                );
              }
              return items;
            })}
          </ol>
        </nav>

        {runReport ? (
          <p aria-live="polite" className={`rounded-lg border px-3 py-2 text-xs font-bold ${runReport.changed ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-muted text-muted-foreground"}`}>
            <strong className="font-black">{runReport.stageLabel}</strong> 단계부터 실행했습니다 · 최종 판정 {runReport.before}
            <span aria-hidden="true"> → </span>
            {runReport.after}
            {runReport.changed ? "" : " (변화 없음)"}
          </p>
        ) : null}
      </div>

      <div id="guardrail-panel" className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-live="polite">
            <p className="min-w-0">
              <span className="font-mono text-[10px] font-bold uppercase text-primary">{selection.kind === "node" ? "선택한 노드" : "선택한 엣지"}</span>
              <span className="ml-2 text-sm font-black">{selectedNode?.label ?? selectedEdge?.decisionLabel}</span>
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">가드레일 {PRESS_RAG_GUARDRAIL_IDS.length}개 · 위반 {results.filter(({ verdict }) => verdict === "VIOLATION").length}</p>
          </div>

          <div className="mt-3">
            <Inspection inspection={inspection} />
          </div>

          <div className="mt-3 grid min-w-0 gap-2.5">
            {notable.map((result) => <GuardrailLane key={result.guardrailId} result={result} open={result.verdict === "VIOLATION"} />)}
            {inapplicable.length ? (
              <details className="min-w-0 rounded-xl border border-border bg-card">
                <summary className="cursor-pointer p-3 text-xs font-black text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  이 단계에서 해당 없는 가드레일 {inapplicable.length}개
                </summary>
                <div className="grid gap-2.5 p-3 pt-0">
                  {inapplicable.map((result) => <GuardrailLane key={result.guardrailId} result={result} open />)}
                </div>
              </details>
            ) : null}
          </div>

          {selection.kind === "node" ? (
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="노드 이동">
              <button type="button" disabled={nodeIndex <= 0} onClick={() => moveToNode(nodeIndex - 1)} className="min-h-11 rounded-lg border border-border text-sm font-black disabled:opacity-40">← 이전 상태</button>
              <button type="button" disabled={nodeIndex === workflow.nodes.length - 1} onClick={() => moveToNode(nodeIndex + 1)} className="min-h-11 rounded-lg bg-primary text-sm font-black text-primary-foreground disabled:opacity-40">다음 상태 →</button>
            </div>
          ) : null}
        </div>

        <PressRagWorkflowSandboxPanel
          draft={draft}
          errors={errors}
          runErrors={runErrors}
          editedStages={editedStages}
          recorded={recorded}
          tested={testResult}
          onChange={changeDraft}
          onRun={run}
          onReset={() => reset()}
        />
      </div>

      <details className="mt-4 min-w-0 rounded-xl border border-border bg-muted/35">
        <summary className="cursor-pointer p-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          선택 기록 출처 · {artifact.artifact}
        </summary>
        <div className="px-3 pb-3">
          <p className="break-all font-mono text-[10px] text-muted-foreground">configuration hash {artifact.configurationHash}</p>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="font-bold text-muted-foreground">아티팩트 실행 시작</dt><dd><time dateTime={artifact.startedAt}>{artifact.startedAt}</time><br />KST · {kst(artifact.startedAt)}</dd></div>
            <div><dt className="font-bold text-muted-foreground">아티팩트 실행 완료</dt><dd><time dateTime={artifact.completedAt}>{artifact.completedAt}</time><br />KST · {kst(artifact.completedAt)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">위 시간은 개별 반복의 시간이 아니라 아티팩트 실행 window입니다. {caseId}의 repetition {recordedOutcome.runIndex} of {repetitionCount}은 선택 아티팩트 안의 실행 인덱스를 뜻합니다.</p>
          <p className="mt-1 break-all font-mono text-[10px]">안전한 기록 실행 참조 · {recordedOutcome.recordedExecutionRef}</p>
        </div>
      </details>
    </section>
  );
}
