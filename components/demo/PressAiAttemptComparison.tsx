"use client";

import { useEffect, useState } from "react";
import {
  fetchPressAiCheckpointComparison,
  type PressAiCheckpointComparison,
} from "@/lib/pressAiProcessDebuggerClient";

export function PressAiAttemptComparison(props: {
  attemptId: string;
  refreshKey: string;
}) {
  const [items, setItems] = useState<PressAiCheckpointComparison[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchPressAiCheckpointComparison(props.attemptId)
      .then((value) => {
        if (alive) setItems(value);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [props.attemptId, props.refreshKey]);
  return (
    <section className="rounded-xl border border-border p-4 text-sm">
      <h3 className="font-black">이전 시도와 비교</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          재시도한 노드를 실행하면 이전 결과와의 차이가 여기에 표시됩니다.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border p-3">
              <div className="flex justify-between gap-2">
                <strong>
                  {item.oldVerdict ?? "—"} → {item.newVerdict ?? "—"}
                </strong>
                <span>{item.outputComparison.changed ? "변경됨" : "동일"}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {item.outputComparison.fields
                  ?.filter((field) => field.changed)
                  .map((field) => (
                    <li key={field.key}>
                      <details>
                        <summary className="cursor-pointer font-bold">
                          {field.key}
                        </summary>
                        <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                          {JSON.stringify(
                            { 이전: field.oldValue, 현재: field.newValue },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
