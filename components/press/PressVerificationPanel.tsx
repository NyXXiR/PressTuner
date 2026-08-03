"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createPressFlowApiClient,
  type VerificationState as PressVerificationState,
} from "@/lib/press/pressFlowApiClient";

export type { PressVerificationState };

const pressFlowApi = createPressFlowApiClient();

export function PressVerificationPanel({
  articleId,
  teamId,
  refreshKey,
  onStateChange,
}: {
  articleId: string;
  teamId?: string | null;
  refreshKey?: string | number;
  onStateChange?: (state: PressVerificationState | null) => void;
}) {
  const [state, setState] = useState<PressVerificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    void refreshKey;
    try {
      const nextState = await pressFlowApi.readVerification(articleId, teamId);
      setState(nextState);
      onStateChange?.(nextState);
    } catch {
      // Preserve the panel's quiet initial/refresh read behavior.
    }
  }, [articleId, onStateChange, refreshKey, teamId]);

  useEffect(() => {
    setState(null);
    onStateChange?.(null);
    void load();
  }, [load, onStateChange]);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await pressFlowApi.runVerification(articleId, {
        teamId: teamId ?? undefined,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const current = state?.freshness === "CURRENT";
  const result = state?.verification?.result;
  const resultLabel = result
    ? { PASS: "통과", WARN: "확인 필요", BLOCK: "완료 차단" }[result]
    : null;
  return (
    <section className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">최종 원고 검증</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            현재 원고·채택 사실·팀 지식 버전이 모두 일치해야 최종 확정할 수
            있습니다.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void verify()}
          className="border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
        >
          {busy ? "검증 중..." : current ? "다시 검증" : "원고 검증"}
        </button>
      </div>
      <p className="mt-3 text-sm font-semibold">
        상태:{" "}
        {!state?.verification
          ? "검증 전"
          : !current
            ? "변경되어 검증 만료"
            : resultLabel}
      </p>
      {state?.verification?.findings.length ? (
        <ul className="mt-3 space-y-2 text-xs">
          {state.verification.findings.map((finding) => (
            <li key={finding.id} className="border-l-2 border-border pl-3">
              <strong>
                {{ PASS: "통과", WARN: "확인 필요", BLOCK: "완료 차단" }[
                  finding.result
                ]}
              </strong>{" "}
              {finding.claim} —{" "}
              {finding.explanation}
            </li>
          ))}
        </ul>
      ) : null}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </section>
  );
}
