"use client";
import { useState } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
const Json = ({ value }: { value: unknown }) => (
  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">
    {JSON.stringify(value, null, 2)}
  </pre>
);
export function PressAiEdgeInspector(props: {
  attempt: PressAiCheckpointAttempt;
  edgeId: string;
  busy: boolean;
  onAdvance: (warn: boolean, human: boolean) => void;
  onRetry: (nodeId?: string) => void;
}) {
  const [warn, setWarn] = useState(false);
  const [human, setHuman] = useState(false);
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
  if (!edge) return null;
  const restartable = props.attempt.checkpoints.filter(
    (item) => item.sequence <= (checkpoint?.sequence ?? -1),
  );
  return (
    <section
      className="rounded-xl border border-border p-4"
      aria-label={`${edge.id} 전이 검사`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black">
          {edge.source} → {edge.target}
        </h3>
        <span className="rounded-full border px-3 py-1 text-xs font-black">
          {transition?.verdict ?? "PENDING"}
        </span>
      </div>
      <h4 className="mt-4 text-sm font-bold">소스 출력</h4>
      <Json value={checkpoint?.output ?? null} />
      <h4 className="mt-4 text-sm font-bold">파생 대상 입력</h4>
      <Json value={transition?.targetPayload ?? null} />
      <h4 className="mt-4 text-sm font-bold">가드레일 관찰</h4>
      <ol className="mt-2 space-y-2">
        {transition?.observations.map((item) => (
          <li key={item.id} className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between gap-2">
              <strong>{item.guardrailId}</strong>
              <b>{item.verdict}</b>
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
      {transition?.verdict === "WARN" ? (
        <label className="mt-4 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={warn}
            onChange={(event) => setWarn(event.target.checked)}
          />
          WARN 확인
        </label>
      ) : null}
      {edge.humanGate ? (
        <label className="mt-2 flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={human}
            onChange={(event) => setHuman(event.target.checked)}
          />
          사람 확인: {edge.humanGate.label}
        </label>
      ) : null}
      {transition?.verdict === "BLOCK" ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-rose-700">
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
                  {item.nodeId}
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
      ) : transition && !transition.advancedAt ? (
        <button
          type="button"
          disabled={
            props.busy ||
            (transition.verdict === "WARN" && !warn) ||
            (Boolean(edge.humanGate) && !human)
          }
          onClick={() => props.onAdvance(warn, human)}
          className="mt-4 min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
        >
          다음 노드 활성화
        </button>
      ) : null}
    </section>
  );
}
