"use client";

import { useState } from "react";

import { insertPressAiOpsTestProcess } from "@/lib/pressAiProcessDebuggerClient";

type Status =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success"; operationId: string; factCount: number }
  | { state: "error"; code: string };

export function PressAiOpsTestDataControl() {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  const insert = async () => {
    setStatus({ state: "submitting" });
    try {
      const receipt = await insertPressAiOpsTestProcess();
      setStatus({
        state: "success",
        operationId: receipt.operationId,
        factCount: receipt.factCount,
      });
    } catch (error) {
      setStatus({
        state: "error",
        code: error instanceof Error ? error.message : "OPS_TEST_PROCESS_INSERT_FAILED",
      });
    }
  };

  return (
    <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4" aria-labelledby="ops-test-data-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="ops-test-data-title" className="text-sm font-black">OPS 프로세스 테스트 데이터</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            AI 실행과 할당량 사용 없이 샘플 워크플로, 단계, 전이, 리뷰 데이터를 OPS에 넣습니다.
          </p>
        </div>
        <button
          type="button"
          disabled={status.state === "submitting"}
          onClick={() => void insert()}
          className="min-h-11 shrink-0 rounded-lg border border-border bg-background px-4 text-sm font-black disabled:opacity-50"
        >
          {status.state === "submitting" ? "OPS에 넣는 중…" : "테스트 데이터 넣기"}
        </button>
      </div>
      <div className="mt-2 min-h-5 text-xs" aria-live="polite">
        {status.state === "success" ? (
          <p className="break-all text-emerald-700 dark:text-emerald-300">
            {status.factCount}개 팩트 삽입 완료 · Operation ID: {status.operationId}
          </p>
        ) : status.state === "error" ? (
          <p role="alert" className="text-rose-700 dark:text-rose-300">삽입 실패: {status.code}</p>
        ) : null}
      </div>
    </section>
  );
}
