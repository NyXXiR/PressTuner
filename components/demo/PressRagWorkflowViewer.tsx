"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "@/domain/evaluation/pressRagDemoPresenter";
import { resolvePressRagWorkflowNavigationIndex } from "@/domain/evaluation/pressRagWorkflowNavigation";
import {
  PRESS_RAG_GUARDRAIL_IDS,
  projectPressRagGuardrails,
  rollUpGuardrails,
  type PressRagGuardrailResult,
  type PressRagGuardrailVerdict,
} from "@/domain/evaluation/pressRagGuardrails";
import {
  projectPressRagWorkflowView,
  type PressRagWorkflowNodeId,
  type PressRagWorkflowStatus,
} from "@/domain/evaluation/pressRagWorkflowView";

type Configuration = "baseline" | "candidate";
type Selection = { kind: "node"; id: PressRagWorkflowNodeId } | { kind: "edge"; id: string };
type WorkflowExpectation = PressRagDemoViewModel["scenarios"][number]["expectation"];

const VERDICT_COPY: Readonly<Record<PressRagGuardrailVerdict, { icon: string; label: string; tone: string; stripe: string }>> = {
  PASS: { icon: "✓", label: "지킴", tone: "border-emerald-500/45 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100", stripe: "bg-emerald-500" },
  VIOLATION: { icon: "×", label: "위반", tone: "border-rose-500/50 bg-rose-500/12 text-rose-900 dark:text-rose-100", stripe: "bg-rose-500" },
  NOT_EVALUABLE: { icon: "?", label: "평가 불가", tone: "border-amber-500/45 bg-amber-500/12 text-amber-900 dark:text-amber-100", stripe: "bg-amber-500" },
  NOT_APPLICABLE: { icon: "–", label: "해당 없음", tone: "border-border bg-muted text-muted-foreground", stripe: "bg-border" },
};

const STATE_COPY: Readonly<Record<PressRagWorkflowStatus, string>> = {
  RECORDED: "기록됨", MATCH: "기대와 일치", MISMATCH: "불일치",
  FAILED: "실패 기록", NOT_EVALUABLE: "평가 불가", SKIPPED: "건너뜀",
};

const EDGE_STATE_COPY = { TAKEN: "통과", NOT_TAKEN: "미통과", UNKNOWN: "확인 불가" } as const;

function VerdictChip({ verdict, text }: { verdict: PressRagGuardrailVerdict; text?: string }) {
  const copy = VERDICT_COPY[verdict];
  return (
    <span role="status" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black ${copy.tone}`}>
      <span aria-hidden="true">{copy.icon}</span>{text ?? copy.label}
    </span>
  );
}

/**
 * One guardrail, always rendered. Lanes never reorder or disappear between selections, so a
 * reader can move across the graph and compare the same rule in the same place.
 */
function GuardrailLane({ result, onTest }: { result: PressRagGuardrailResult; onTest: () => string | null }) {
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const copy = VERDICT_COPY[result.verdict];

  return (
    <article className="grid min-w-0 grid-cols-[4px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card">
      <div aria-hidden="true" className={copy.stripe} />
      <div className="flex min-w-0 flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-black text-foreground">{result.label}</h4>
          <VerdictChip verdict={result.verdict} />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {result.gate ? <span className="font-bold text-primary">전이 조건 · </span> : null}
          {result.rule}
        </p>
        <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
          {([["기대", result.expected], ["관측", result.observed], ["판정 이유", result.reason]] as const).map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-lg border border-border/80 bg-background/70 p-2.5">
              <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-xs leading-5 text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {result.verdict === "NOT_APPLICABLE" ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTestOutput(onTest())}
              className="min-h-9 rounded-lg border border-border px-3 text-xs font-black text-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              재검증
            </button>
            <span aria-live="polite" className="font-mono text-[11px] text-muted-foreground">{testOutput}</span>
          </div>
        )}
      </div>
    </article>
  );
}

export function PressRagWorkflowViewer({
  baseline,
  candidate,
  expectation,
  prompt,
  baselineLabel = "Baseline v1",
  candidateLabel = "Candidate v3 optimized",
}: {
  baseline: PressRagRecordedOutcome;
  candidate: PressRagRecordedOutcome;
  expectation: WorkflowExpectation;
  prompt: string;
  baselineLabel?: string;
  candidateLabel?: string;
}) {
  const [configuration, setConfiguration] = useState<Configuration>("candidate");
  const outcome = configuration === "baseline" ? baseline : candidate;
  const workflow = projectPressRagWorkflowView(outcome, expectation, prompt);
  const guardrails = projectPressRagGuardrails(outcome, expectation, workflow);

  // Open on the first stage that actually judged something. Request intake evaluates no
  // guardrail yet, so landing there would show five empty lanes.
  const firstJudged = workflow.nodes.find(
    (node) => rollUpGuardrails(guardrails.byNode[node.id] ?? []) !== "NOT_APPLICABLE",
  );
  const initialSelection: Selection = { kind: "node", id: firstJudged?.id ?? workflow.initiallySelectedNodeId };

  const [selection, setSelection] = useState<Selection>(initialSelection);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedNode = selection.kind === "node"
    ? workflow.nodes.find((node) => node.id === selection.id) ?? workflow.nodes[0]!
    : null;
  const selectedEdge = selection.kind === "edge"
    ? workflow.edges.find((edge) => edge.id === selection.id) ?? null
    : null;
  const results = selection.kind === "node"
    ? guardrails.byNode[selection.id] ?? []
    : guardrails.byEdge[selection.id] ?? [];

  const nodeIndex = selectedNode ? workflow.nodes.findIndex((node) => node.id === selectedNode.id) : -1;
  const violations = results.filter((entry) => entry.verdict === "VIOLATION").length;
  const unresolved = results.filter((entry) => entry.verdict === "NOT_EVALUABLE").length;

  function selectConfiguration(next: Configuration) {
    setConfiguration(next);
    setSelection(initialSelection);
  }

  function moveToNode(index: number) {
    const node = workflow.nodes[index];
    if (!node) return;
    setSelection({ kind: "node", id: node.id });
    const button = buttonRefs.current[index];
    button?.focus();
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = resolvePressRagWorkflowNavigationIndex(event.key, index, workflow.nodes.length);
    if (nextIndex === index) return;
    event.preventDefault();
    moveToNode(nextIndex);
  }

  // Re-applies the recorded judgment. No model, API, or database is contacted.
  function retest(result: PressRagGuardrailResult) {
    return `재검증 완료 · 기록 재적용 · 판정 ${VERDICT_COPY[result.verdict].label} 유지`;
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="workflow-heading">
      {/* The page title already names this screen, and the reading instruction sits with the
          selection bar below where it applies, so this row carries only controls. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="workflow-heading" className="text-sm font-black text-foreground">상태 전이 그래프</h2>
        <div className="grid min-w-0 grid-cols-2 gap-2" role="group" aria-label="워크플로 구성 선택">
          {([["baseline", baselineLabel], ["candidate", candidateLabel]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={configuration === id}
              onClick={() => selectConfiguration(id)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${configuration === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {workflow.summary.replaySource} · {workflow.summary.recordedStatus} · 전체 {workflow.summary.totalLatencyMs.toLocaleString("ko-KR")} ms ·{" "}
        <span className="break-all">{workflow.summary.recordedExecutionRef}</span>
      </p>

      {/* The graph wraps so the whole state machine stays visible; edges are selectable
          because a transition condition is itself a guardrail judgment. */}
      <nav className="mt-3" aria-label="워크플로 노드와 엣지">
        <ol className="flex min-w-0 flex-wrap items-stretch gap-y-2">
          {workflow.nodes.flatMap((node, index) => {
            const nodeVerdict = rollUpGuardrails(guardrails.byNode[node.id] ?? []);
            const isSelected = selection.kind === "node" && selection.id === node.id;
            const items = [(
              <li key={node.id} className="w-full min-w-0 shrink-0 sm:w-[10.5rem]">
                <button
                  ref={(element) => { buttonRefs.current[index] = element; }}
                  type="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-current={isSelected ? "step" : undefined}
                  aria-controls="guardrail-panel"
                  aria-label={`${node.label}: ${STATE_COPY[node.status]}, 가드레일 ${VERDICT_COPY[nodeVerdict].label}`}
                  onClick={() => setSelection({ kind: "node", id: node.id })}
                  onKeyDown={(event) => handleNodeKeyDown(event, index)}
                  className={`flex h-full w-full flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/60"}`}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")} · {node.status}</span>
                  <span className="break-words text-[12.5px] font-black leading-tight text-foreground">{node.label}</span>
                  <VerdictChip verdict={nodeVerdict} />
                </button>
              </li>
            )];

            const edge = workflow.edges.find(({ source }) => source === node.id);
            if (edge) {
              const edgeVerdict = rollUpGuardrails(guardrails.byEdge[edge.id] ?? []);
              const isEdgeSelected = selection.kind === "edge" && selection.id === edge.id;
              items.push(
                <li key={edge.id} className="w-full min-w-0 shrink-0 sm:w-[6.5rem]">
                  <button
                    type="button"
                    aria-pressed={isEdgeSelected}
                    aria-controls="guardrail-panel"
                    aria-label={`전이 ${edge.decisionLabel}: ${EDGE_STATE_COPY[edge.state]}, 가드레일 ${VERDICT_COPY[edgeVerdict].label}`}
                    onClick={() => setSelection({ kind: "edge", id: edge.id })}
                    className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isEdgeSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"}`}
                  >
                    <span aria-hidden="true" className="text-base leading-none text-muted-foreground">
                      <span className="sm:hidden">↓</span><span className="hidden sm:inline">→</span>
                    </span>
                    <span className="break-words text-[10.5px] font-bold leading-tight text-muted-foreground">{edge.decisionLabel}</span>
                    <VerdictChip verdict={edgeVerdict} text={EDGE_STATE_COPY[edge.state]} />
                  </button>
                </li>,
              );
            }
            return items;
          })}
        </ol>
      </nav>

      <div id="guardrail-panel" className="mt-4 min-w-0">
        <p className="mb-2 text-xs text-muted-foreground">노드나 엣지를 고르면 그 지점에서 5개 가드레일이 어떻게 처리됐는지 아래에 나옵니다.</p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3" aria-live="polite">
          <p className="min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
              {selection.kind === "node" ? "선택한 노드" : "선택한 엣지"}
            </span>
            <span className="ml-2 break-words text-sm font-black text-foreground">
              {selectedNode ? `${nodeIndex + 1}. ${selectedNode.label}` : selectedEdge?.decisionLabel}
            </span>
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
              {selectedNode
                ? `${STATE_COPY[selectedNode.status]} · ${selectedNode.latencyMs === null ? "지연 기록 없음" : `${selectedNode.latencyMs.toLocaleString("ko-KR")} ms`}`
                : selectedEdge
                  ? `${EDGE_STATE_COPY[selectedEdge.state]} · ${selectedEdge.state}`
                  : ""}
            </span>
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            가드레일 {PRESS_RAG_GUARDRAIL_IDS.length}개 · 위반 {violations} · 평가 불가 {unresolved}
          </p>
        </div>

        <div className="mt-3 grid min-w-0 gap-2.5">
          {results.map((result) => (
            <GuardrailLane key={result.guardrailId} onTest={() => retest(result)} result={result} />
          ))}
        </div>

        {selection.kind === "node" ? (
          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="노드 이동">
            <button type="button" disabled={nodeIndex <= 0} onClick={() => moveToNode(nodeIndex - 1)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40">← 이전 상태</button>
            <button type="button" disabled={nodeIndex === workflow.nodes.length - 1} onClick={() => moveToNode(nodeIndex + 1)} className="min-h-11 rounded-lg border border-primary bg-primary px-3 text-sm font-black text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40">다음 상태 →</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
