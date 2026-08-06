"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { projectPressAgentWorkflow, type PressAgentWorkflowEventV1 } from "@/domain/evaluation/pressAgentWorkflowEvents";
import { cancelPressAgentRagDebuggerRun, fetchPressAgentRagDebuggerHistory, replayPressAgentRagDebuggerRun, startPressAgentRagDebuggerRun, type PressAgentRagDebuggerHistoryItem } from "@/lib/pressAgentRagDebuggerClient";
import { PressRagLiveWorkflowViewer } from "./PressRagLiveWorkflowViewer";
import { PressRagRunHistory } from "./PressRagRunHistory";

const RUN_STATUS_COPY = {
  idle: "실행 전",
  running: "실행 중",
  succeeded: "정상 완료",
  warning: "확인 필요",
  failed: "실행 실패",
  cancelled: "취소됨",
  blocked: "가드레일 차단",
} as const;

export function PressRagLiveDebugger() {
  const [auth, setAuth] = useState<"checking" | "authenticated" | "anonymous">("checking");
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<PressAgentWorkflowEventV1[]>([]);
  const [history, setHistory] = useState<PressAgentRagDebuggerHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const projection = useMemo(() => projectPressAgentWorkflow(events, { now }), [events, now]);
  const runId = events[0]?.runId ?? null;

  const refreshHistory = useCallback(async () => { try { setHistory(await fetchPressAgentRagDebuggerHistory()); } catch { /* auth state owns the message */ } }, []);
  useEffect(() => { void fetch("/api/me", { cache: "no-store" }).then((response) => { setAuth(response.ok ? "authenticated" : "anonymous"); if (response.ok) void refreshHistory(); }).catch(() => setAuth("anonymous")); }, [refreshHistory]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1_000); return () => clearInterval(timer); }, []);

  function receive(event: PressAgentWorkflowEventV1) {
    setEvents((current) => current.some((entry) => entry.eventId === event.eventId || entry.dedupeKey === event.dedupeKey) ? current : [...current, event]);
  }

  async function run() {
    if (!prompt.trim() || busy) return;
    setEvents([]); setError(null); setBusy(true);
    let observedRunId: string | null = null;
    try {
      const received = await startPressAgentRagDebuggerRun({ prompt: prompt.trim(), onEvent: (event) => { observedRunId = event.runId; receive(event); } });
      const id = received[0]?.runId;
      if (id) { const replay = await replayPressAgentRagDebuggerRun(id, Math.max(0, ...received.map((event) => event.sequence))); replay.events.forEach(receive); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "실행 스트림 연결에 실패했습니다.");
      if (observedRunId) { try { (await replayPressAgentRagDebuggerRun(observedRunId, projection.lastSequence)).events.forEach(receive); } catch { /* preserve transport error */ } }
    } finally { setBusy(false); void refreshHistory(); }
  }

  async function open(run: string) {
    setError(null);
    try { setEvents((await replayPressAgentRagDebuggerRun(run)).events); } catch (cause) { setError(cause instanceof Error ? cause.message : "기록을 열 수 없습니다."); }
  }

  async function cancel() {
    if (!runId) return;
    try { await cancelPressAgentRagDebuggerRun(runId); (await replayPressAgentRagDebuggerRun(runId, projection.lastSequence)).events.forEach(receive); } catch (cause) { setError(cause instanceof Error ? cause.message : "취소하지 못했습니다."); }
  }

  return (
    <section className="rounded-2xl border border-primary/35 bg-card p-4 shadow-sm sm:p-6" aria-labelledby="live-rag-debugger-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-primary">실제 Press Agent</p><h2 id="live-rag-debugger-heading" className="mt-1 text-xl font-black">실시간 RAG 실행 디버거</h2></div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-bold">{RUN_STATUS_COPY[projection.runStatus]}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">로그인한 현재 팀에서 실제 AI를 실행하며 기존 Press 사용량 1회를 차감합니다. 보통 수십 초, 최대 약 2분이 걸릴 수 있습니다. 프롬프트와 답변 내용은 이 공개 진행 이벤트에 포함되지 않습니다.</p>
      {auth === "anonymous" ? <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><strong>로그인과 팀 선택이 필요합니다.</strong> 아래 로컬 예제는 로그인 없이 볼 수 있지만 실제 실행과 기록은 사용할 수 없습니다.</div> : null}
      <label htmlFor="rag-debug-prompt" className="mt-5 block text-sm font-black">테스트 프롬프트</label>
      <textarea id="rag-debug-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={auth !== "authenticated" || busy} maxLength={12000} rows={4} placeholder="확인하려는 보도자료 근거 질문을 입력하세요." className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm disabled:cursor-not-allowed disabled:opacity-60" />
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void run()} disabled={auth !== "authenticated" || busy || !prompt.trim()} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-50">{busy ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />AI 실행 중</span> : "AI 테스트 실행"}</button>{busy && runId ? <button type="button" onClick={() => void cancel()} className="min-h-11 rounded-xl border border-rose-500 px-4 text-sm font-bold text-rose-600">실행 취소</button> : null}{runId ? <button type="button" onClick={() => void open(runId)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">저장 이벤트 다시 읽기</button> : null}</div>
      <div className="mt-3 text-xs text-muted-foreground" aria-live="polite">{projection.lastEventAt ? `마지막 이벤트 ${new Date(projection.lastEventAt).toLocaleTimeString("ko-KR")}` : "아직 수신한 워크플로 이벤트가 없습니다."}{projection.stalled ? " · 30초 이상 새 이벤트가 없어 지연 상태입니다." : ""}{error ? ` · 오류: ${error}` : ""}</div>
      <PressRagLiveWorkflowViewer projection={projection} />
      {auth === "authenticated" ? <PressRagRunHistory runs={history} onOpen={(id) => void open(id)} /> : null}
    </section>
  );
}
