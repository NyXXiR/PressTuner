"use client";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
export function PressAiWorkflowOutline(props: {
  attempt: PressAiCheckpointAttempt | null;
  busy: boolean;
  onNode: (id: string) => void;
  onEdge: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  return (
    <section
      className="rounded-xl border border-border p-4"
      aria-label="보이는 순서형 워크플로 개요"
    >
      <h3 className="font-black">순서형 워크플로 개요</h3>
      <ol className="mt-3 space-y-3">
        {pressCreationProcess.nodes.map((node) => {
          const checkpoint = props.attempt?.checkpoints.find(
            (item) => item.nodeId === node.id,
          );
          const active = props.attempt?.activeNodeId === node.id;
          const outgoing = pressCreationProcess.edges.filter(
            (edge) => edge.source === node.id,
          );
          return (
            <li key={node.id} className="rounded-lg border p-3">
              <button
                type="button"
                onClick={() => props.onNode(node.id)}
                className="min-h-11 w-full text-left font-bold focus-visible:ring-2 focus-visible:ring-primary"
              >
                {active && props.busy ? (
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  />
                ) : null}
                {node.sequence + 1}. {node.label} ·{" "}
                {active && props.busy
                  ? "RUNNING"
                  : active
                    ? "ACTIVE"
                    : (checkpoint?.mode ?? "WAITING")}
              </button>
              {active && node.id !== "selected-rewrite" ? (
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onExecute(node.id)}
                  className="mt-2 min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
                >
                  이 노드만 실행
                </button>
              ) : null}
              {active && node.id === "selected-rewrite" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  아래의 리뷰 노트 선택 패널에서 실행하세요.
                </p>
              ) : null}
              {outgoing.map((edge) => {
                const transition = props.attempt?.transitions.find(
                  (item) => item.edgeId === edge.id,
                );
                return (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => props.onEdge(edge.id)}
                    className="mt-2 block min-h-11 w-full rounded border px-3 text-left text-sm"
                  >
                    ↳ {edge.id}: {transition?.verdict ?? "PENDING"}
                    {transition?.advancedAt ? " · ADVANCED" : ""}
                  </button>
                );
              })}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
