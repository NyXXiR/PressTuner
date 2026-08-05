"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "@/domain/evaluation/pressRagDemoPresenter";
import { resolvePressRagWorkflowNavigationIndex } from "@/domain/evaluation/pressRagWorkflowNavigation";
import {
  projectPressRagWorkflowView,
  type PressRagWorkflowDetail,
  type PressRagWorkflowEdge,
  type PressRagWorkflowNode,
  type PressRagWorkflowNodeId,
  type PressRagWorkflowStatus,
} from "@/domain/evaluation/pressRagWorkflowView";

type Configuration = "baseline" | "candidate";
type WorkflowExpectation = PressRagDemoViewModel["scenarios"][number]["expectation"];

const STATUS_COPY: Readonly<Record<PressRagWorkflowStatus, { icon: string; label: string; tone: string }>> = {
  RECORDED: { icon: "●", label: "기록됨", tone: "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100" },
  MATCH: { icon: "✓", label: "기대와 일치", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100" },
  MISMATCH: { icon: "×", label: "불일치", tone: "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100" },
  FAILED: { icon: "!", label: "실패 기록", tone: "border-rose-600 bg-rose-600 text-white" },
  NOT_EVALUABLE: { icon: "?", label: "평가 불가", tone: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100" },
  SKIPPED: { icon: "–", label: "건너뜀", tone: "border-border bg-muted text-muted-foreground" },
};

const TRAVERSAL_COPY = {
  TRAVERSED: "경로 통과",
  NOT_TRAVERSED: "경로 미통과",
  UNKNOWN: "경로 확인 불가",
} as const;

const EDGE_STATE_COPY = {
  TAKEN: "통과",
  NOT_TAKEN: "미통과",
  UNKNOWN: "확인 불가",
} as const;

const EDGE_STATE_TONE = {
  TAKEN: "border-primary/50 bg-primary/10 text-primary",
  NOT_TAKEN: "border-border bg-muted text-muted-foreground",
  UNKNOWN: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
} as const;

function StatusBadge({ status }: { status: PressRagWorkflowStatus }) {
  const copy = STATUS_COPY[status];
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${copy.tone}`}>
      <span aria-hidden="true">{copy.icon}</span>{copy.label}
    </span>
  );
}

function InspectionPanel({ title, entries, tone }: {
  title: string;
  entries: readonly PressRagWorkflowDetail[];
  tone: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border p-3 ${tone}`} aria-label={title}>
      <h5 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">{title}</h5>
      {entries.length ? (
        <dl className="mt-2 space-y-2 text-xs">
          {entries.map((entry) => (
            <div key={entry.key} className="rounded-lg border border-border/80 bg-background/80 p-3">
              <dt className="font-bold text-muted-foreground">{entry.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words leading-5 text-foreground">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">기록 없음</p>
      )}
    </section>
  );
}

/**
 * One state transition, expanded. Debugging a recorded run means comparing what entered a
 * state, which edge the run actually took, what the guardrails decided, and what came out —
 * so every transition stays on the page instead of hiding behind the current selection.
 */
function TransitionBlock({
  node,
  index,
  total,
  incoming,
  outgoing,
  previousLabel,
  nextLabel,
  selected,
}: {
  node: PressRagWorkflowNode;
  index: number;
  total: number;
  incoming: PressRagWorkflowEdge | null;
  outgoing: PressRagWorkflowEdge | null;
  previousLabel: string | null;
  nextLabel: string | null;
  selected: boolean;
}) {
  return (
    <article
      id={`workflow-transition-${node.id}`}
      aria-label={`상태 ${index + 1}/${total} ${node.label}`}
      className={`min-w-0 scroll-mt-4 rounded-xl border p-4 ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">상태 {index + 1} / {total}</p>
          <h4 className="mt-1 break-words text-lg font-black text-foreground">{node.label}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground">
            {node.latencyMs === null ? "지연 기록 없음" : `${node.latencyMs.toLocaleString("ko-KR")} ms`}
          </span>
          <StatusBadge status={node.status} />
        </div>
      </div>

      {/* 전환: the node-edge-node hop this state sits in. */}
      <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3" aria-label={`${node.label} 상태 전환`}>
        <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">전환</p>
        <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <li className="font-semibold text-muted-foreground">{previousLabel ?? "시작"}</li>
          <li aria-hidden="true" className="text-muted-foreground">→</li>
          <li>
            {incoming ? (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${EDGE_STATE_TONE[incoming.state]}`}>
                {incoming.decisionLabel} · {EDGE_STATE_COPY[incoming.state]} · {incoming.state}
              </span>
            ) : <span className="text-muted-foreground">진입 조건 없음</span>}
          </li>
          <li aria-hidden="true" className="text-muted-foreground">→</li>
          <li className="font-black text-foreground">{node.label}</li>
          <li aria-hidden="true" className="text-muted-foreground">→</li>
          <li>
            {outgoing ? (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${EDGE_STATE_TONE[outgoing.state]}`}>
                {outgoing.decisionLabel} · {EDGE_STATE_COPY[outgoing.state]} · {outgoing.state}
              </span>
            ) : <span className="text-muted-foreground">종료</span>}
          </li>
          <li aria-hidden="true" className="text-muted-foreground">→</li>
          <li className="font-semibold text-muted-foreground">{nextLabel ?? "종료"}</li>
        </ol>
        <p className="mt-2 text-xs font-bold text-foreground">{node.traversal} · {TRAVERSAL_COPY[node.traversal]}</p>
      </div>

      <p className="mt-3 break-words rounded-lg bg-muted p-3 text-sm leading-6 text-foreground">{node.statusReason}</p>
      {node.reasonCode ? (
        <p className="mt-2 break-words text-xs text-muted-foreground"><code>{node.reasonCode}</code> · {node.reasonText}</p>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <InspectionPanel title="입력" entries={node.inspection.input} tone="border-sky-500/30 bg-sky-500/5" />
        <InspectionPanel title="출력" entries={node.inspection.output} tone="border-emerald-500/30 bg-emerald-500/5" />
        <InspectionPanel title="정책·가드레일 결정" entries={node.inspection.decisions} tone="border-violet-500/30 bg-violet-500/5" />
        <InspectionPanel title="근거" entries={node.inspection.evidence} tone="border-amber-500/30 bg-amber-500/5" />
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
  const [selectedNodeId, setSelectedNodeId] = useState<PressRagWorkflowNodeId>(workflow.initiallySelectedNodeId);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldScrollRef = useRef(false);
  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? workflow.nodes[0]!;
  const selectedNodeIndex = workflow.nodes.findIndex((node) => node.id === selectedNode.id);
  const incomingEdge = workflow.edges.find(({ target }) => target === selectedNode.id) ?? null;
  const outgoingEdge = workflow.edges.find(({ source }) => source === selectedNode.id) ?? null;
  const graphItems = workflow.nodes.flatMap((node) => {
    const nextEdge = workflow.edges.find(({ source }) => source === node.id);
    return nextEdge
      ? [{ kind: "node" as const, node }, { kind: "edge" as const, edge: nextEdge }]
      : [{ kind: "node" as const, node }];
  });

  // Selecting a state brings its transition into view, without stealing scroll on first
  // render or when the configuration toggle resets the selection.
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    document.getElementById(`workflow-transition-${selectedNode.id}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedNode.id]);

  function selectNode(id: PressRagWorkflowNodeId) {
    shouldScrollRef.current = true;
    setSelectedNodeId(id);
  }

  function selectConfiguration(next: Configuration) {
    setConfiguration(next);
    setSelectedNodeId(workflow.initiallySelectedNodeId);
  }

  function moveToNode(index: number, focus = false) {
    const node = workflow.nodes[index];
    if (!node) return;
    selectNode(node.id);
    if (focus) {
      const button = buttonRefs.current[index];
      button?.focus();
      button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = resolvePressRagWorkflowNavigationIndex(event.key, index, workflow.nodes.length);
    if (nextIndex === index) return;
    event.preventDefault();
    moveToNode(nextIndex, true);
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="workflow-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Recorded RAG workflow debugger</p>
          <h2 id="workflow-heading" className="mt-1 text-2xl font-black text-foreground">RAG 실행 워크플로 디버거</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            승인된 기록의 상태 전이를 그래프로 보여주고, 각 전이의 입력·전환·출력·가드레일 결과를 아래에 모두 펼칩니다.
          </p>
        </div>
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

      <section className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-label="버전이 지정된 실행 요약">
        <div className="flex flex-wrap justify-between gap-3 text-xs">
          <p><span className="font-bold text-muted-foreground">요약 계약</span><br /><code>{workflow.summary.schemaVersion}</code></p>
          <p className="min-w-0 max-w-full text-right"><span className="font-bold text-muted-foreground">기록 실행 참조 · {workflow.summary.recordedExecutionRefVersion}</span><br /><code className="break-all">{workflow.summary.recordedExecutionRef}</code></p>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {workflow.summary.facts.map((fact) => (
            <div key={fact.key} className="min-w-0 rounded-lg border border-border bg-background p-3">
              <dt className="text-xs font-bold text-muted-foreground">{fact.label}</dt>
              <dd className="mt-2"><StatusBadge status={fact.status} /></dd>
              <dd className="mt-2 break-words text-xs text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          {workflow.summary.replaySource} · {workflow.summary.recordedStatus} · 전체 {workflow.summary.totalLatencyMs.toLocaleString("ko-KR")} ms · {workflow.schemaVersion}
        </p>
      </section>

      {/* The whole state machine stays visible: nodes and edges wrap instead of scrolling
          off to the right, so the shape of the run can be read at a glance. */}
      <nav className="mt-6" aria-label="기록된 RAG 워크플로 상태 그래프">
        <ol className="flex min-w-0 flex-wrap items-stretch gap-y-3">
          {graphItems.map((item) => {
            if (item.kind === "edge") {
              const active = incomingEdge?.id === item.edge.id || outgoingEdge?.id === item.edge.id;
              return (
                <li key={item.edge.id} className="flex w-full shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1 text-center sm:w-[7.5rem]">
                  <span aria-hidden="true" className={`text-lg leading-none ${active ? "text-primary" : "text-muted-foreground"}`}>
                    <span className="sm:hidden">↓</span><span className="hidden sm:inline">→</span>
                  </span>
                  <span className={`text-[11px] font-bold leading-tight ${active ? "text-primary" : "text-muted-foreground"}`}>{item.edge.decisionLabel}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${EDGE_STATE_TONE[item.edge.state]}`}>
                    {EDGE_STATE_COPY[item.edge.state]} · {item.edge.state}
                  </span>
                </li>
              );
            }
            const index = workflow.nodes.findIndex(({ id }) => id === item.node.id);
            const status = STATUS_COPY[item.node.status];
            return (
              <li key={item.node.id} className="w-full min-w-0 shrink-0 sm:w-[11.5rem]">
                <button
                  ref={(element) => { buttonRefs.current[index] = element; }}
                  id={`workflow-node-${item.node.id}`}
                  type="button"
                  tabIndex={item.node.id === selectedNode.id ? 0 : -1}
                  aria-current={item.node.id === selectedNode.id ? "step" : undefined}
                  aria-controls={`workflow-transition-${item.node.id}`}
                  aria-label={`${item.node.label}: ${item.node.status}, ${item.node.traversal}`}
                  onClick={() => selectNode(item.node.id)}
                  onKeyDown={(event) => handleNodeKeyDown(event, index)}
                  className={`flex h-full min-h-24 w-full flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${item.node.id === selectedNode.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:bg-muted/60"}`}
                >
                  <span className="break-words text-sm font-black text-foreground">{index + 1}. {item.node.label}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${status.tone}`}>
                    <span aria-hidden="true">{status.icon}</span>{status.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="min-w-0 text-xs" aria-live="polite">
          <span className="font-black text-primary">현재 위치 {selectedNodeIndex + 1}/{workflow.nodes.length}</span>
          <span className="ml-2 break-words text-muted-foreground">
            {incomingEdge ? `${incomingEdge.decisionLabel} (${incomingEdge.state}) → ` : "시작 → "}
            <strong className="text-foreground">{selectedNode.label}</strong>
            {outgoingEdge ? ` → ${outgoingEdge.decisionLabel} (${outgoingEdge.state})` : " → 종료"}
          </span>
        </p>
        <div className="flex gap-2" role="group" aria-label="상태 전이 이동">
          <button type="button" disabled={selectedNodeIndex === 0} onClick={() => moveToNode(selectedNodeIndex - 1, true)} className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40">← 이전 상태</button>
          <button type="button" disabled={selectedNodeIndex === workflow.nodes.length - 1} onClick={() => moveToNode(selectedNodeIndex + 1, true)} className="min-h-11 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-black text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40">다음 상태 →</button>
        </div>
      </div>

      <div id="workflow-node-detail" className="mt-4 grid min-w-0 gap-4">
        {workflow.nodes.map((node, index) => (
          <TransitionBlock
            key={node.id}
            incoming={workflow.edges.find(({ target }) => target === node.id) ?? null}
            index={index}
            nextLabel={workflow.nodes[index + 1]?.label ?? null}
            node={node}
            outgoing={workflow.edges.find(({ source }) => source === node.id) ?? null}
            previousLabel={workflow.nodes[index - 1]?.label ?? null}
            selected={node.id === selectedNode.id}
            total={workflow.nodes.length}
          />
        ))}
      </div>
    </section>
  );
}
