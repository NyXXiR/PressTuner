"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PressAiAttemptHistory } from "./PressAiAttemptHistory";
import { PressAiAttemptWorkspace } from "./PressAiAttemptWorkspace";
import { PressAiKnowledgePanel } from "./PressAiKnowledgePanel";
import { DEFAULT_MEMO } from "./pressAiDebuggerDefaults";
import { usePressAiCheckpointDebugger } from "./usePressAiCheckpointDebugger";

const DRAFT_KEY = "press-ai-debugger-draft";
const LOGIN_HREF = "/login?next=%2Fdemo%2Frag-test";

type DebuggerDraft = {
  rawText: string;
  tone: "formal" | "neutral" | "friendly";
  reviewInstruction: string;
  rewriteInstruction: string;
};

const DEFAULT_DRAFT: DebuggerDraft = {
  rawText: DEFAULT_MEMO,
  tone: "formal",
  reviewInstruction: "사실과 주의 문구가 보존됐는지 검토해 주세요.",
  rewriteInstruction: "선택한 의견만 반영하고 새 사실을 만들지 마세요.",
};

/** Restores what the operator typed before the login round-trip. */
function readStoredDraft(): DebuggerDraft {
  if (typeof window === "undefined") return DEFAULT_DRAFT;
  try {
    const stored = window.sessionStorage.getItem(DRAFT_KEY);
    if (!stored) return DEFAULT_DRAFT;
    const draft = JSON.parse(stored) as Partial<DebuggerDraft>;
    return {
      rawText:
        typeof draft.rawText === "string" && draft.rawText.trim()
          ? draft.rawText
          : DEFAULT_DRAFT.rawText,
      tone:
        draft.tone === "formal" ||
        draft.tone === "neutral" ||
        draft.tone === "friendly"
          ? draft.tone
          : DEFAULT_DRAFT.tone,
      reviewInstruction:
        typeof draft.reviewInstruction === "string"
          ? draft.reviewInstruction
          : DEFAULT_DRAFT.reviewInstruction,
      rewriteInstruction:
        typeof draft.rewriteInstruction === "string"
          ? draft.rewriteInstruction
          : DEFAULT_DRAFT.rewriteInstruction,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function PressAiProcessDebugger() {
  const debuggerState = usePressAiCheckpointDebugger();
  const [auth, setAuth] = useState<"checking" | "authenticated" | "anonymous">(
    "checking",
  );
  const [rawText, setRawText] = useState(() => readStoredDraft().rawText);
  const [tone, setTone] = useState<"formal" | "neutral" | "friendly">(
    () => readStoredDraft().tone,
  );
  const [reviewInstruction, setReviewInstruction] = useState(
    () => readStoredDraft().reviewInstruction,
  );
  const [rewriteInstruction, setRewriteInstruction] = useState(
    () => readStoredDraft().rewriteInstruction,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const newAttemptHeadingRef = useRef<HTMLHeadingElement>(null);

  const goToLogin = () => {
    try {
      window.sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ rawText, tone, reviewInstruction, rewriteInstruction }),
      );
    } catch {
      // Storage is best-effort; the login navigation matters more.
    }
  };

  const startNewInput = () => {
    debuggerState.clear();
    window.requestAnimationFrame(() => newAttemptHeadingRef.current?.focus());
  };

  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then((response) => setAuth(response.ok ? "authenticated" : "anonymous"))
      .catch(() => setAuth("anonymous"));
  }, []);
  useEffect(() => {
    if (debuggerState.error) errorRef.current?.focus();
  }, [debuggerState.error]);

  const attempt = debuggerState.attempt;
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Press AI 체크포인트 디버거"
    >
      {/* One quiet line, not a second filled CTA: the form already ends in one. */}
      {auth === "anonymous" ? (
        <p className="text-sm text-muted-foreground">
          <Link
            href={LOGIN_HREF}
            onClick={goToLogin}
            className="font-bold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            로그인
          </Link>
          하면 실제로 실행해 볼 수 있습니다. 지금 작성한 메모와 지침은 로그인
          후에도 유지됩니다.
        </p>
      ) : null}
      {debuggerState.error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl border border-rose-500 p-4 text-sm text-rose-700 dark:text-rose-300"
        >
          {debuggerState.error}
        </div>
      ) : null}
      <PressAiKnowledgePanel />
      {debuggerState.loading && !attempt ? (
        <p
          role="status"
          className="rounded-xl border border-border p-4 text-sm text-muted-foreground"
        >
          주소에 저장된 시도를 불러오는 중입니다…
        </p>
      ) : !attempt ? (
        // The second column only exists for the history rail, so an anonymous
        // visitor gets the full width instead of a 300px hole.
        <div
          className={`grid min-w-0 items-start gap-6 ${
            auth === "authenticated"
              ? "lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
              : ""
          }`}
        >
          <div className="min-w-0 space-y-4">
            <h2
              ref={newAttemptHeadingRef}
              tabIndex={-1}
              className="text-lg font-black focus:outline-none"
            >
              새 Press AI 시도
            </h2>
            {/* 3fr/2fr, not 1fr/1fr: the memo is the work, the three short
                fields beside it are settings and left a hole at equal widths. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <label className="text-sm font-bold">
                대략적인 메모
                <textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  rows={9}
                  className="pt-input mt-2 p-3"
                />
              </label>
              <div className="space-y-3">
                <label className="block text-sm font-bold">
                  문체
                  <select
                    value={tone}
                    onChange={(event) =>
                      setTone(event.target.value as typeof tone)
                    }
                    className="pt-input mt-2 min-h-11 px-3"
                  >
                    <option value="formal">격식</option>
                    <option value="neutral">중립</option>
                    <option value="friendly">친근</option>
                  </select>
                </label>
                <label className="block text-sm font-bold">
                  리뷰 지침
                  <input
                    value={reviewInstruction}
                    onChange={(event) => setReviewInstruction(event.target.value)}
                    className="pt-input mt-2 min-h-11 px-3"
                  />
                </label>
                <label className="block text-sm font-bold">
                  재작성 지침
                  <input
                    value={rewriteInstruction}
                    onChange={(event) => setRewriteInstruction(event.target.value)}
                    className="pt-input mt-2 min-h-11 px-3"
                  />
                </label>
              </div>
            </div>
            {auth === "anonymous" ? (
              <p className="text-sm text-muted-foreground">
                시도를 만들면 새 테스트 Article이 생성되고, 명시적으로 실행한 AI
                노드만 일반 Press 할당량을 사용합니다.
              </p>
            ) : (
              <label className="flex min-h-11 gap-3 rounded-xl border border-amber-500/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  새 테스트 Article이 생성되고 명시적으로 실행한 AI 노드만 일반
                  Press 할당량을 사용함을 확인했습니다.
                </span>
              </label>
            )}
            {auth === "anonymous" ? (
              <Link
                href={LOGIN_HREF}
                onClick={goToLogin}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-black text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                로그인하고 시작하기
              </Link>
            ) : (
              <button
                type="button"
                disabled={
                  debuggerState.busy ||
                  auth !== "authenticated" ||
                  !acknowledged ||
                  !rawText.trim()
                }
                onClick={() =>
                  void debuggerState.create({
                    rawText,
                    tone,
                    reviewInstruction,
                    rewriteInstruction,
                  })
                }
                className="min-h-11 rounded-xl bg-primary px-5 font-black text-primary-foreground disabled:opacity-50"
              >
                새 시도 만들기 (AI 실행 없음)
              </button>
            )}
          </div>
          {auth === "authenticated" ? (
            <PressAiAttemptHistory
              refreshKey="initial"
              onOpen={debuggerState.open}
            />
          ) : null}
        </div>
      ) : (
        <PressAiAttemptWorkspace
          key={attempt.id}
          attempt={attempt}
          busy={debuggerState.busy}
          loading={debuggerState.loading}
          onClear={startNewInput}
          onOpen={debuggerState.open}
          onExecute={debuggerState.execute}
          onAdvance={debuggerState.advance}
          onRetry={debuggerState.retry}
          onSaveCase={debuggerState.saveCase}
        />
      )}
      <p aria-live="polite" className="sr-only">
        {debuggerState.busy
          ? "명령을 저장하고 있습니다."
          : debuggerState.loading
            ? "저장된 시도를 불러오고 있습니다."
            : attempt?.activeNodeId
              ? `활성 노드: ${attempt.activeNodeId}`
              : attempt
                ? "엣지 검사 또는 종료 상태입니다."
                : "시도를 만들면 문서만 준비됩니다."}
      </p>
    </section>
  );
}
