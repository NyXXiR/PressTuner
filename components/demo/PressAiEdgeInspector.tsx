"use client";
import { useState } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { GuardrailChip } from "./PressAiVerdictBadge";
const Json = ({ value }: { value: unknown }) => (
  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">
    {JSON.stringify(value, null, 2)}
  </pre>
);
/**
 * Detail for one transition, rendered inside its timeline row.
 * Advancing lives in the run action bar; this panel explains the judgment and, when the
 * verdict is BLOCK, offers the only remaining move: restarting from an earlier node.
 */
export function PressAiEdgeInspector(props: {
  attempt: PressAiCheckpointAttempt;
  edgeId: string;
  busy: boolean;
  onRetry: (nodeId: string) => void;
  onReevaluate: (transitionId: string) => void;
}) {
  const edge = pressCreationProcess.edges.find(
    (item) => item.id === props.edgeId,
  );
  const transition = props.attempt.transitions.find(
    (item) => item.edgeId === props.edgeId,
  );
  const checkpoint = props.attempt.checkpoints.find(
    (item) => item.nodeId === edge?.source,
  );
  const [retryNodeId, setRetryNodeId] = useState(edge?.source ?? "");
  const latestEvaluationRevision = Math.max(0, ...(transition?.observations.map((item) => item.evaluationRevision) ?? []));
  if (!edge) return null;
  const restartable = props.attempt.checkpoints.filter(
    (item) => item.sequence <= (checkpoint?.sequence ?? -1),
  );
  return (
    <section
      className="min-w-0 rounded-xl border border-border bg-background p-4"
      aria-label={`${edge.id} 전이 검사`}
    >
      {/* The timeline row directly above already names this transition. */}
      <p className="text-xs text-muted-foreground">
        소스 출력에서 이 전이가 실제로 만들어 낸 대상 입력입니다.
      </p>
      <div className="mt-2">
        <Json value={transition?.targetPayload ?? null} />
      </div>
      <h4 className="mt-4 text-sm font-bold">가드레일 관찰</h4>
      <ol className="mt-2 space-y-2">
        {transition?.observations.map((item) => (
          <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <GuardrailChip
                guardrailId={item.guardrailId}
                verdict={item.verdict}
                origin={item.origin}
              />
            </div>
            <dl className="mt-2 grid gap-1 text-xs">
              <div>
                <dt className="font-bold">기대</dt>
                <dd>{item.expected}</dd>
              </div>
              <div>
                <dt className="font-bold">관찰</dt>
                <dd>{item.observed}</dd>
              </div>
              <div>
                <dt className="font-bold">이유</dt>
                <dd>{item.reason}</dd>
              </div>
            </dl>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-bold">
                근거
              </summary>
              <Json value={item.evidence} />
            </details>
          </li>
        )) ?? (
          <li className="text-sm text-muted-foreground">
            소스 노드를 실행하면 평가됩니다.
          </li>
        )}
      </ol>
      {transition?.evaluationState === "COMPLETED" && transition.observations.some((item) => item.origin === "CASE_GUARDRAIL" && item.evaluationRevision === latestEvaluationRevision && item.evaluationStatus === "NOT_EVALUABLE") ? (
        <button type="button" disabled={props.busy} onClick={() => props.onReevaluate(transition.id)} className="mt-4 min-h-11 rounded-lg border border-violet-500 px-4 font-bold text-violet-700 dark:text-violet-300">
          의미 가드레일 다시 평가
        </button>
      ) : null}
      {transition?.verdict === "BLOCK" ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            BLOCK은 재정의할 수 없습니다. 초안 케이스가 자동 저장되었습니다.
          </p>
          <label className="mt-3 block text-sm font-bold">
            다시 시작할 노드
            <select
              value={retryNodeId}
              onChange={(event) => setRetryNodeId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded border bg-background px-3"
            >
              {restartable.map((item) => (
                <option key={item.id} value={item.nodeId}>
                  {pressCreationProcess.nodes.find((node) => node.id === item.nodeId)?.label ?? item.nodeId}
                  {item.nodeId === edge.source ? " (권장)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={props.busy || !retryNodeId}
            onClick={() => props.onRetry(retryNodeId)}
            className="mt-2 min-h-11 rounded-lg border px-4 font-bold"
          >
            새 시도로 다시 실행
          </button>
        </div>
      ) : null}
    </section>
  );
}
