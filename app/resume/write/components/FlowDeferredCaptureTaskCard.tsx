"use client";

import { Clock3, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import type { FlowDeferredCaptureTask } from "@/domain/resume-writing/flowMachine";

export function FlowDeferredCaptureTaskCard({
  task,
  questionIndex,
  onRetry,
}: {
  readonly task: FlowDeferredCaptureTask;
  readonly questionIndex: number;
  readonly onRetry: (reopenApplication: boolean) => void;
}) {
  const pending = task.retryStatus === "pending";
  const needsAttention = task.status === "needs_attention";
  return (
    <article className="border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {needsAttention ? (
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            문항 {questionIndex + 1} 경력 기억 추출
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {needsAttention
              ? "자동 재시도가 끝났습니다. 답변은 완료 상태로 안전하게 보관되어 있어요."
              : `잠시 후 자동으로 다시 시도합니다. 현재 ${task.attemptCount}회 시도했습니다.`}
          </p>
          {task.error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
              {task.error}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => onRetry(task.requiresReopen)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {task.requiresReopen ? "다시 열고 재시도" : "지금 재시도"}
        </button>
      </div>
    </article>
  );
}
