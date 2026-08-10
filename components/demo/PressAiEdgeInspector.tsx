"use client";
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
 * Mutation controls live in the run and experiment action surfaces; this panel only
 * explains the persisted transition judgment.
 */
export function PressAiEdgeInspector(props: {
  attempt: PressAiCheckpointAttempt;
  edgeId: string;
}) {
  const edge = pressCreationProcess.edges.find(
    (item) => item.id === props.edgeId,
  );
  const transition = props.attempt.transitions.find(
    (item) => item.edgeId === props.edgeId,
  );
  if (!edge) return null;
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
      {transition?.verdict === "BLOCK" ? (
        <p className="mt-4 text-sm font-bold text-rose-700 dark:text-rose-300">
          BLOCK은 재정의할 수 없습니다. 초안 케이스가 자동 저장되었습니다.
        </p>
      ) : null}
    </section>
  );
}
