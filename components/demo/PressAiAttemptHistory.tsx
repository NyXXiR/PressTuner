"use client";

import { useEffect, useState } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { formatRelativeTimeKo } from "@/lib/formatRelativeTimeKo";
import { isDefaultMemoExcerpt } from "./pressAiDebuggerDefaults";
import { attemptStatusLabel } from "./pressAiRunProgress";
import {
  fetchPressAiCheckpointAttemptHistory,
  type PressAiCheckpointAttemptSummary,
} from "@/lib/pressAiProcessDebuggerClient";

export function PressAiAttemptHistory(props: {
  attemptId?: string;
  refreshKey: string;
  onOpen: (attemptId: string) => void;
}) {
  const [attempts, setAttempts] = useState<PressAiCheckpointAttemptSummary[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPressAiCheckpointAttemptHistory()
      .then((items) => {
        if (alive) setAttempts(items);
      })
      .catch((reason) => {
        if (alive)
          setError(
            reason instanceof Error
              ? reason.message
              : "기록을 불러오지 못했습니다.",
          );
      });
    return () => {
      alive = false;
    };
  }, [props.refreshKey]);
  const nodeCount = pressCreationProcess.nodes.length;
  return (
    <aside className="rounded-xl border border-border p-4 text-sm">
      <h3 className="font-black">시도 기록</h3>
      {error ? <p className="mt-2 text-rose-700 dark:text-rose-300">{error}</p> : null}
      <ol className="mt-3 max-h-64 space-y-2 overflow-auto">
        {attempts.map((item) => {
          const statusLabel = attemptStatusLabel(item.status);
          const completed = item.status === "COMPLETED";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => props.onOpen(item.id)}
                aria-current={item.id === props.attemptId ? "true" : undefined}
                title={item.id}
                className="min-h-11 w-full rounded-lg border border-border p-2.5 text-left aria-[current=true]:border-primary aria-[current=true]:bg-primary/5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-bold">
                    {isDefaultMemoExcerpt(item.memoExcerpt)
                      ? "기본 메모"
                      : item.memoExcerpt || "메모 없음"}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-black ${
                      completed
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-muted-foreground"
                    }`}
                  >
                    {completed
                      ? `${nodeCount}/${nodeCount} 완료`
                      : `${item.checkpointCount ?? 0}/${nodeCount} 노드`}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.parentAttemptId ? "재시도" : "최초 시도"} · {statusLabel}
                  {item.createdAt
                    ? ` · ${formatRelativeTimeKo(item.createdAt)}`
                    : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {attempts.length === 0 && !error ? (
        <p className="mt-2 text-muted-foreground">저장된 시도가 없습니다.</p>
      ) : null}
    </aside>
  );
}
