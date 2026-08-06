"use client";
import { useEffect, useRef, useState } from "react";
import { PressAiProcessGraph } from "./PressAiProcessGraph";
import { PressAiEdgeInspector } from "./PressAiEdgeInspector";
import { PressAiWorkflowOutline } from "./PressAiWorkflowOutline";
import { PressAiAttemptHistory } from "./PressAiAttemptHistory";
import { PressAiCasePanel } from "./PressAiCasePanel";
import { PressAiAttemptComparison } from "./PressAiAttemptComparison";
import { usePressAiCheckpointDebugger } from "./usePressAiCheckpointDebugger";

const DEFAULT_MEMO =
  "픽셔널 기업 브리프랩은 2031년 4월 17일 ‘루멘 브릿지’를 출시할 예정이다. 비공개 베타에는 20곳이 참여했고, 작업 시간은 150분에서 50분으로 줄었다. 이는 단순 평균이며 대조군이 없고 외부 검증을 거치지 않았다.";
export function PressAiProcessDebugger() {
  const debuggerState = usePressAiCheckpointDebugger();
  const [auth, setAuth] = useState<"checking" | "authenticated" | "anonymous">(
    "checking",
  );
  const [rawText, setRawText] = useState(DEFAULT_MEMO);
  const [tone, setTone] = useState<"formal" | "neutral" | "friendly">("formal");
  const [reviewInstruction, setReviewInstruction] = useState(
    "사실과 주의 문구가 보존됐는지 검토해 주세요.",
  );
  const [rewriteInstruction, setRewriteInstruction] = useState(
    "선택한 의견만 반영하고 새 사실을 만들지 마세요.",
  );
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then((response) => setAuth(response.ok ? "authenticated" : "anonymous"))
      .catch(() => setAuth("anonymous"));
  }, []);
  useEffect(() => {
    if (debuggerState.error) errorRef.current?.focus();
  }, [debuggerState.error]);
  const attempt = debuggerState.attempt;
  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };
  const selectEdge = (id: string) => {
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  };
  const activeCheckpoint = selectedNodeId
    ? attempt?.checkpoints.find((item) => item.nodeId === selectedNodeId)
    : null;
  const reviewCheckpoint = attempt?.checkpoints.find(
    (item) => item.nodeId === "draft-review",
  );
  const reviewNotes =
    reviewCheckpoint &&
    reviewCheckpoint.output &&
    typeof reviewCheckpoint.output === "object" &&
    Array.isArray((reviewCheckpoint.output as { notes?: unknown[] }).notes)
      ? (
          reviewCheckpoint.output as { notes: Array<Record<string, unknown>> }
        ).notes.filter((item) => typeof item.id === "string")
      : [];
  const refreshKey = attempt ? `${attempt.id}:${attempt.revision}` : "empty";
  return (
    <section
      className="min-w-0 rounded-2xl border border-primary/35 bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="press-ai-debugger-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            Press creation · checkpoint v2
          </p>
          <h2
            id="press-ai-debugger-heading"
            className="mt-1 text-xl font-black"
          >
            Press AI 체크포인트 디버거
          </h2>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-bold">
          {attempt?.status ?? "NOT_STARTED"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        노드 실행과 엣지 이동은 별도 명령입니다. 기존 RAG-v1 기록은 기존 URL에서
        계속 읽을 수 있으며, 이 화면에는 자동 실행 경로가 없습니다.
      </p>
      {auth === "anonymous" ? (
        <p className="mt-4 rounded-xl border border-amber-500/40 p-4 text-sm">
          로그인과 팀 선택이 필요합니다.
        </p>
      ) : null}
      {debuggerState.error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 rounded-xl border border-rose-500 p-4 text-sm text-rose-700"
        >
          {debuggerState.error}
        </div>
      ) : null}
      {!attempt ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-bold">
              대략적인 메모
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                rows={7}
                className="mt-2 w-full rounded-xl border bg-background p-3"
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
                  className="mt-2 min-h-11 w-full rounded border bg-background px-3"
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
                  className="mt-2 min-h-11 w-full rounded border bg-background px-3"
                />
              </label>
              <label className="block text-sm font-bold">
                재작성 지침
                <input
                  value={rewriteInstruction}
                  onChange={(event) =>
                    setRewriteInstruction(event.target.value)
                  }
                  className="mt-2 min-h-11 w-full rounded border bg-background px-3"
                />
              </label>
            </div>
          </div>
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
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="min-w-0 space-y-4">
            <PressAiProcessGraph
              attempt={attempt}
              busy={debuggerState.busy}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onNode={selectNode}
              onEdge={selectEdge}
            />
            {attempt.activeNodeId === "selected-rewrite" ? (
              <section className="rounded-xl border p-4">
                <h3 className="font-black">반영할 리뷰 노트 선택</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  저장된 리뷰 결과 중 실제로 반영할 항목만 고르세요.
                </p>
                <ul className="mt-3 space-y-2">
                  {reviewNotes.map((note) => {
                    const id = String(note.id);
                    const label =
                      typeof note.message === "string"
                        ? note.message
                        : typeof note.text === "string"
                          ? note.text
                          : id;
                    return (
                      <li key={id}>
                        <label className="flex min-h-11 gap-3 rounded border p-3 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedNoteIds.includes(id)}
                            onChange={(event) =>
                              setSelectedNoteIds((items) =>
                                event.target.checked
                                  ? [...items, id]
                                  : items.filter((item) => item !== id),
                              )
                            }
                          />
                          <span>
                            <strong>{id}</strong>
                            <br />
                            {label}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <label className="mt-3 block text-sm font-bold">
                  수정 지침
                  <input
                    value={rewriteInstruction}
                    onChange={(event) =>
                      setRewriteInstruction(event.target.value)
                    }
                    className="mt-1 min-h-11 w-full rounded border bg-background px-3"
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    debuggerState.busy ||
                    selectedNoteIds.length === 0 ||
                    !rewriteInstruction.trim()
                  }
                  onClick={() =>
                    void debuggerState.execute("selected-rewrite", {
                      selectedNoteIds,
                      rewriteInstruction,
                    })
                  }
                  className="mt-3 min-h-11 rounded bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
                >
                  선택한 노트로 수정 실행
                </button>
              </section>
            ) : null}
            {selectedNodeId && activeCheckpoint ? (
              <section className="rounded-xl border p-4">
                <h3 className="font-black">{selectedNodeId} 체크포인트</h3>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
                  {JSON.stringify(
                    {
                      input: activeCheckpoint.input,
                      output: activeCheckpoint.output,
                    },
                    null,
                    2,
                  )}
                </pre>
              </section>
            ) : null}
            {selectedEdgeId ? (
              <PressAiEdgeInspector
                key={selectedEdgeId}
                attempt={attempt}
                edgeId={selectedEdgeId}
                busy={debuggerState.busy}
                onAdvance={(warn, human) =>
                  void debuggerState.advance(selectedEdgeId, warn, human)
                }
                onRetry={(nodeId) => void debuggerState.retry(nodeId)}
              />
            ) : null}
          </div>
          <div className="space-y-4">
            <PressAiWorkflowOutline
              attempt={attempt}
              busy={debuggerState.busy}
              onNode={selectNode}
              onEdge={selectEdge}
              onExecute={(id) => void debuggerState.execute(id)}
            />
            <PressAiAttemptHistory
              attemptId={attempt.id}
              refreshKey={refreshKey}
              onOpen={(id) => void debuggerState.open(id)}
            />
            <PressAiCasePanel
              checkpoints={attempt.checkpoints}
              busy={debuggerState.busy}
              onSave={(checkpointId, name, expectations) =>
                void debuggerState.saveCase(checkpointId, name, expectations)
              }
            />
            <PressAiAttemptComparison
              attemptId={attempt.id}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      )}
      <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
        {debuggerState.busy
          ? "명령을 저장하고 있습니다."
          : attempt?.activeNodeId
            ? `활성 노드: ${attempt.activeNodeId}`
            : attempt
              ? "엣지 검사 또는 종료 상태입니다."
              : "시도를 만들면 문서만 준비됩니다."}
      </p>
    </section>
  );
}
