"use client";

import type { PressAgentRagDebuggerHistoryItem } from "@/lib/pressAgentRagDebuggerClient";

const HISTORY_STATUS_COPY: Record<string, string> = {
  COMPLETED: "완료",
  FAILED: "실패",
  CANCELED: "취소됨",
  CANCEL_REQUESTED: "취소 중",
  WAITING_APPROVAL: "승인 대기",
  RUNNING: "실행 중",
};

export function PressRagRunHistory({ runs, onOpen }: { runs: PressAgentRagDebuggerHistoryItem[]; onOpen: (runId: string) => void }) {
  return (
    <section className="mt-5" aria-labelledby="rag-debug-history">
      <h3 id="rag-debug-history" className="text-sm font-black">내 실행 기록</h3>
      {runs.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{runs.map((run) => <li key={run.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-xs"><span className="min-w-0"><strong className="block">AI 테스트 · {HISTORY_STATUS_COPY[run.status] ?? run.status}</strong><span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString("ko-KR")} · 실행 ID {run.id.slice(0, 8)}</span></span><button type="button" onClick={() => onOpen(run.id)} className="min-h-10 shrink-0 rounded-lg border border-border px-3 font-bold hover:bg-muted">결과 보기</button></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">아직 이 팀에서 실행한 디버거 기록이 없습니다.</p>}
    </section>
  );
}
