"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "@/domain/evaluation/pressRagDemoPresenter";
import { resolvePressRagWorkflowNavigationIndex } from "@/domain/evaluation/pressRagWorkflowNavigation";
import {
  projectPressRagWorkflowView,
  type PressRagWorkflowDetail,
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
      <h4 className="text-sm font-black text-foreground">{title}</h4>
      <dl className="mt-2 space-y-2 text-xs">
        {entries.map((entry) => (
          <div key={entry.key} className="rounded-lg border border-border/80 bg-background/80 p-3">
            <dt className="font-bold text-muted-foreground">{entry.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words leading-5 text-foreground">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
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

  function selectConfiguration(next: Configuration) {
    setConfiguration(next);
    setSelectedNodeId(workflow.initiallySelectedNodeId);
  }

  function moveToNode(index: number, focus = false) {
    const node = workflow.nodes[index];
    if (!node) return;
    setSelectedNodeId(node.id);
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
            승인된 기록의 입력, 근거, 정책·가드레일 결정, 출력을 일곱 단계로 재생합니다.
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

      <nav className="mt-6" aria-label="기록된 RAG 워크플로 단계">
        <ol className="flex min-w-0 flex-col items-stretch gap-2 overflow-x-visible lg:flex-row lg:items-center lg:overflow-x-auto lg:pb-3">
          {graphItems.map((item) => {
            if (item.kind === "edge") {
              const active = incomingEdge?.id === item.edge.id || outgoingEdge?.id === item.edge.id;
              return (
                <li key={item.edge.id} className={`flex shrink-0 flex-col items-center justify-center px-1 py-1 text-center text-[11px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <span aria-hidden="true" className="text-lg leading-none lg:hidden">↓</span>
                  <span aria-hidden="true" className="hidden text-lg leading-none lg:block">→</span>
                  <span>{item.edge.decisionLabel}</span>
                  <span>{EDGE_STATE_COPY[item.edge.state]} · {item.edge.state}</span>
                </li>
              );
            }
            const index = workflow.nodes.findIndex(({ id }) => id === item.node.id);
            const status = STATUS_COPY[item.node.status];
            return (
              <li key={item.node.id} className="min-w-0 shrink-0 lg:w-52">
                <button
                  ref={(element) => { buttonRefs.current[index] = element; }}
                  id={`workflow-node-${item.node.id}`}
                  type="button"
                  tabIndex={item.node.id === selectedNode.id ? 0 : -1}
                  aria-current={item.node.id === selectedNode.id ? "step" : undefined}
                  aria-controls="workflow-node-detail"
                  aria-label={`${item.node.label}: ${item.node.status}, ${item.node.traversal}`}
                  onClick={() => setSelectedNodeId(item.node.id)}
                  onKeyDown={(event) => handleNodeKeyDown(event, index)}
                  className={`flex min-h-24 w-full flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${item.node.id === selectedNode.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:bg-muted/60"}`}
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

      <section
        id="workflow-node-detail"
        className="mt-6 min-w-0 rounded-xl border border-border bg-background p-4 sm:p-5"
        aria-labelledby="workflow-detail-heading"
        aria-live="polite"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">선택한 단계</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h3 id="workflow-detail-heading" className="break-words text-xl font-black text-foreground">{selectedNode.label}</h3>
          <StatusBadge status={selectedNode.status} />
        </div>
        <p className="mt-3 break-words rounded-lg bg-muted p-3 text-sm leading-6 text-foreground">{selectedNode.statusReason}</p>
        {selectedNode.reasonCode ? (
          <p className="mt-2 break-words text-xs text-muted-foreground"><code>{selectedNode.reasonCode}</code> · {selectedNode.reasonText}</p>
        ) : null}
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs" aria-label="현재 상태 전이">
          <p className="font-black text-primary">현재 위치 {selectedNodeIndex + 1}/{workflow.nodes.length}</p>
          <p className="mt-1 break-words text-muted-foreground">
            {incomingEdge ? `${incomingEdge.decisionLabel} (${incomingEdge.state}) → ` : "시작 → "}
            <strong className="text-foreground">{selectedNode.label}</strong>
            {outgoingEdge ? ` → ${outgoingEdge.decisionLabel} (${outgoingEdge.state})` : " → 종료"}
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border p-3"><dt className="text-muted-foreground">경로 상태</dt><dd className="mt-1 font-black text-foreground">{selectedNode.traversal} · {TRAVERSAL_COPY[selectedNode.traversal]}</dd></div>
          <div className="rounded-lg border border-border p-3"><dt className="text-muted-foreground">기록 지연 시간</dt><dd className="mt-1 font-black text-foreground">{selectedNode.latencyMs === null ? "기록되지 않음" : `${selectedNode.latencyMs.toLocaleString("ko-KR")} ms`}</dd></div>
        </dl>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <InspectionPanel title="입력" entries={selectedNode.inspection.input} tone="border-sky-500/30 bg-sky-500/5" />
          <InspectionPanel title="근거" entries={selectedNode.inspection.evidence} tone="border-amber-500/30 bg-amber-500/5" />
          <InspectionPanel title="정책·가드레일 결정" entries={selectedNode.inspection.decisions} tone="border-violet-500/30 bg-violet-500/5" />
          <InspectionPanel title="출력" entries={selectedNode.inspection.output} tone="border-emerald-500/30 bg-emerald-500/5" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="상태 전이 이동">
          <button type="button" disabled={selectedNodeIndex === 0} onClick={() => moveToNode(selectedNodeIndex - 1, true)} className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-black text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">← 이전 상태</button>
          <button type="button" disabled={selectedNodeIndex === workflow.nodes.length - 1} onClick={() => moveToNode(selectedNodeIndex + 1, true)} className="min-h-11 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-black text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">다음 상태 →</button>
        </div>
      </section>
    </section>
  );
}
