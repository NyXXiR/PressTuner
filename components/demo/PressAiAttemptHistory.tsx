"use client";

import { useEffect, useState } from "react";
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
  return (
    <aside className="rounded-xl border border-border p-4 text-sm">
      <h3 className="font-black">시도 기록</h3>
      {error ? <p className="mt-2 text-rose-700">{error}</p> : null}
      <ol className="mt-3 max-h-64 space-y-2 overflow-auto">
        {attempts.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => props.onOpen(item.id)}
              aria-current={item.id === props.attemptId ? "true" : undefined}
              className="min-h-11 w-full rounded-lg border p-2 text-left aria-[current=true]:border-primary aria-[current=true]:bg-primary/5"
            >
              <span className="block font-bold">
                {item.parentAttemptId ? "재시도" : "최초 시도"} · {item.status}
              </span>
              <span className="block break-all text-xs text-muted-foreground">
                {item.id}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {attempts.length === 0 && !error ? (
        <p className="mt-2 text-muted-foreground">저장된 시도가 없습니다.</p>
      ) : null}
    </aside>
  );
}
