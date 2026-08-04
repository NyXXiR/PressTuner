"use client";

import { useState } from "react";

import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "@/domain/evaluation/pressRagDemoPresenter";
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

function StatusBadge({ status }: { status: PressRagWorkflowStatus }) {
  const copy = STATUS_COPY[status];
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${copy.tone}`}>
      <span aria-hidden="true">{copy.icon}</span>
      {copy.label}
    </span>
  );
}

function InspectionPanel({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: readonly PressRagWorkflowDetail[];
  tone: string;
}) {
  return (
    <section className={`rounded-xl border p-3 ${tone}`} aria-label={title}>
      <h4 className="text-sm font-black text-foreground">{title}</h4>
      <dl className="mt-2 space-y-2 text-xs">
        {entries.map((entry, index) => (
          <div key={`${entry.label}-${index}`} className="rounded-lg border border-border/80 bg-background/80 p-3">
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
  const [selectedNodeId, setSelectedNodeId] = useState<PressRagWorkflowNodeId>(
    workflow.initiallySelectedNodeId,
  );
  const selectedNode = workflow.nodes.find((node) => node.id === selectedNodeId) ?? workflow.nodes[0]!;
  const selectedNodeIndex = workflow.nodes.findIndex((node) => node.id === selectedNode.id);
  const incomingEdge = selectedNodeIndex > 0 ? workflow.edges[selectedNodeIndex - 1] : null;
  const outgoingEdge = workflow.edges[selectedNodeIndex] ?? null;

  function selectConfiguration(next: Configuration) {
    setConfiguration(next);
    setSelectedNodeId(workflow.initiallySelectedNodeId);
  }

  function moveToNode(index: number) {
    const node = workflow.nodes[index];
    if (node) setSelectedNodeId(node.id);
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="workflow-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Domain lifecycle debugger</p>
          <h2 id="workflow-heading" className="mt-1 text-2xl font-black text-foreground">도메인 실행 디버거</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            도메인 객체가 요청에서 최종 평가까지 이동한 경로를 재생합니다. 각 노드의 입력, 근거와 판정, 출력을 분리해 확인할 수 있습니다.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2" role="group" aria-label="워크플로 구성 선택">
          {([
            ["baseline", baselineLabel],
            ["candidate", candidateLabel],
          ] as const).map(([id, label]) => (
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

      <p className="mt-4 text-xs font-bold text-muted-foreground">
        선택 구성: {configuration === "baseline" ? baselineLabel : candidateLabel} · 기록 실행 {workflow.recordedRunIndex}
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <nav aria-label="기록된 RAG 단계">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {workflow.nodes.map((node, index) => {
              const status = STATUS_COPY[node.status];
              const edge = workflow.edges[index];
              const transitionActive = index === selectedNodeIndex || index === selectedNodeIndex - 1;
              return (
                <li key={node.id} className="relative min-w-0">
                  <button
                    type="button"
                    aria-pressed={node.id === selectedNodeId}
                    aria-label={`${node.label}: ${node.status}, ${node.traversal}`}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`flex min-h-20 w-full flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${node.id === selectedNodeId ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:bg-muted/60"}`}
                  >
                    <span className="break-words text-sm font-black text-foreground">{index + 1}. {node.label}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${status.tone}`}>
                      <span aria-hidden="true">{status.icon}</span>{status.label}
                    </span>
                  </button>
                  {edge ? (
                    <p aria-hidden="true" className={`px-2 pt-2 text-center text-[11px] font-bold ${transitionActive ? "text-primary" : "text-muted-foreground"}`}>
                      ↓ {edge.decisionLabel} · {edge.state}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </nav>

        <section
          className="min-w-0 rounded-xl border border-border bg-background p-4 sm:p-5"
          aria-labelledby="workflow-detail-heading"
          aria-live="polite"
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">선택한 단계</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <h3 id="workflow-detail-heading" className="break-words text-xl font-black text-foreground">{selectedNode.label}</h3>
            <StatusBadge status={selectedNode.status} />
          </div>
          <p className="mt-3 break-words rounded-lg bg-muted p-3 text-sm leading-6 text-foreground">{selectedNode.statusReason}</p>
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs" aria-label="현재 상태 전이">
            <p className="font-black text-primary">현재 위치 {selectedNodeIndex + 1}/{workflow.nodes.length}</p>
            <p className="mt-1 break-words text-muted-foreground">
              {incomingEdge ? `${incomingEdge.decisionLabel} (${incomingEdge.state}) → ` : "시작 → "}
              <strong className="text-foreground">{selectedNode.label}</strong>
              {outgoingEdge ? ` → ${outgoingEdge.decisionLabel} (${outgoingEdge.state})` : " → 종료"}
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border p-3">
              <dt className="text-muted-foreground">경로 상태</dt>
              <dd className="mt-1 font-black text-foreground">{selectedNode.traversal} · {TRAVERSAL_COPY[selectedNode.traversal]}</dd>
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="text-muted-foreground">기록 지연 시간</dt>
              <dd className="mt-1 font-black text-foreground">{selectedNode.latencyMs === null ? "기록되지 않음" : `${selectedNode.latencyMs.toLocaleString("ko-KR")} ms`}</dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-3">
            <InspectionPanel title="입력" entries={selectedNode.inspection.input} tone="border-sky-500/30 bg-sky-500/5" />
            <InspectionPanel title="근거와 판정" entries={selectedNode.inspection.evidence} tone="border-amber-500/30 bg-amber-500/5" />
            <InspectionPanel title="출력" entries={selectedNode.inspection.output} tone="border-emerald-500/30 bg-emerald-500/5" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="상태 전이 이동">
            <button
              type="button"
              disabled={selectedNodeIndex === 0}
              onClick={() => moveToNode(selectedNodeIndex - 1)}
              className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-black text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← 이전 상태
            </button>
            <button
              type="button"
              disabled={selectedNodeIndex === workflow.nodes.length - 1}
              onClick={() => moveToNode(selectedNodeIndex + 1)}
              className="min-h-11 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-black text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음 상태 →
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
