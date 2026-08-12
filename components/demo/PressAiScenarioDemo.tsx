"use client";

import { useMemo, useRef, useState } from "react";

import {
  PUBLIC_PRESS_RAG_GUIDED_MEMO,
  PUBLIC_PRESS_RAG_LIMITS,
  publicPressRagScenarioProcess,
  type PublicPressRagScenario,
} from "@/domain/demo/pressRagScenarioContract";
import { latestScenarioReviewNotes, repairedScenarioMemo } from "@/domain/demo/pressAiScenario";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { defaultWorkbenchSelection, type PressAiWorkbenchSelection } from "./pressAiStateIo";
import { PressAiProcessGraph } from "./PressAiProcessGraph";
import { PressAiRunTimeline } from "./PressAiRunTimeline";
import { PressAiStateIoPanel } from "./PressAiStateIoPanel";
import { PressAiScenarioEvidencePanel } from "./PressAiScenarioEvidencePanel";
import { PressAiScenarioLineage } from "./PressAiScenarioLineage";
import { usePublicPressRagScenario } from "./usePublicPressRagScenario";

const button = "min-h-11 rounded-lg px-4 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function PressAiScenarioDemo() {
  const runner = usePublicPressRagScenario();
  const [memo, setMemo] = useState(PUBLIC_PRESS_RAG_GUIDED_MEMO);
  const [tone, setTone] = useState<"formal" | "neutral" | "friendly">("formal");
  const [repairMemo, setRepairMemo] = useState(repairedScenarioMemo());
  const [reviewInstruction, setReviewInstruction] = useState("제목과 리드의 명료성을 검토하세요.");
  const [rewriteInstruction, setRewriteInstruction] = useState("선택한 노트만 반영하세요.");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [inspectedAttemptId, setInspectedAttemptId] = useState<string | null>(null);
  const [selection, setSelection] = useState<PressAiWorkbenchSelection | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const nextActionRef = useRef<HTMLDivElement>(null);
  const repairRef = useRef<HTMLTextAreaElement>(null);

  const scenario = runner.scenario;
  const attempt = scenario?.attempt ?? null;
  const inspected = useMemo(
    () => scenario?.attempts.find((item) => item.id === inspectedAttemptId) ?? attempt,
    [attempt, inspectedAttemptId, scenario?.attempts],
  );
  const pending = attempt?.transitions.find((item) => !item.advancedAt) ?? null;
  const reviewNotes = attempt ? latestScenarioReviewNotes(attempt) : [];

  function acceptResult(next: PublicPressRagScenario | null) {
    if (!next) return;
    setInspectedAttemptId(next.attempt.id);
    setSelection(defaultWorkbenchSelection(next.attempt));
    const blocked = next.attempt.transitions.some((item) => !item.advancedAt && item.verdict === "BLOCK");
    requestAnimationFrame(() => blocked ? repairRef.current?.focus() : nextActionRef.current?.focus());
  }

  async function primaryAction() {
    if (!attempt || runner.busy) return;
    if (pending) {
      if (pending.verdict === "BLOCK") acceptResult(await runner.command({ type: "retry_from_block", correctedMemo: repairMemo }));
      else acceptResult(await runner.command({ type: "advance_edge" }));
      return;
    }
    if (!attempt.activeNodeId) return;
    if (attempt.activeNodeId === "draft-review") {
      acceptResult(await runner.command({ type: "execute_node", reviewInstruction }));
    } else if (attempt.activeNodeId === "selected-rewrite") {
      acceptResult(await runner.command({ type: "execute_node", selectedNoteIds, rewriteInstruction }));
    } else {
      acceptResult(await runner.command({ type: "execute_node" }));
    }
  }

  const actionLabel = !attempt
    ? "시나리오 시작"
    : pending?.verdict === "BLOCK"
      ? "수정한 메모로 차단 지점부터 재시도"
      : pending
        ? `${pending.edgeId} 전이 승인`
        : attempt.activeNodeId
          ? `${publicPressRagScenarioProcess.nodes.find((node) => node.id === attempt.activeNodeId)?.label ?? attempt.activeNodeId} 실행`
          : attempt.status === "COMPLETED"
            ? "시나리오 완료"
            : "실행 대기";
  const rewriteReady = attempt?.activeNodeId !== "selected-rewrite" || selectedNoteIds.length > 0;

  return (
    <section className="bg-background px-4 py-10 text-foreground sm:px-6 sm:py-14" aria-label="공개 Press AI RAG 시나리오">
      <div className="mx-auto min-w-0 max-w-7xl">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Live server-side RAG scenario</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">근거 차단과 재시도를 직접 실행하는 Press AI 시나리오</h1>
          <p className="mt-5 text-base leading-8 text-muted-foreground">표시된 고정 문서만 근거로 사용합니다. AI 노드는 서버에서 실제 모델을 호출하고, 실행 상태는 서명된 15분 capability에만 보관됩니다.</p>
        </div>

        <div className="mt-7 grid min-w-0 gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <PressAiScenarioEvidencePanel />
          <section className="min-w-0 rounded-xl border border-border bg-card p-5" aria-labelledby="scenario-input-heading">
            <h2 id="scenario-input-heading" className="text-xl font-black">시나리오 메모</h2>
            <p className="mt-1 text-sm text-muted-foreground">통제 값 360억원은 PDF의 200억원과 달라 초안→리뷰 전이에서 BLOCK되어야 합니다.</p>
            <label className="mt-4 block text-sm font-bold" htmlFor="scenario-memo">메모</label>
            <textarea id="scenario-memo" value={memo} onChange={(event) => setMemo(event.target.value)} disabled={Boolean(scenario)} rows={8} className="pt-input mt-1 min-h-44 resize-y px-3 py-2 disabled:opacity-70" />
            <label className="mt-3 block text-sm font-bold" htmlFor="scenario-tone">톤</label>
            <select id="scenario-tone" value={tone} onChange={(event) => setTone(event.target.value as typeof tone)} disabled={Boolean(scenario)} className="pt-input mt-1 min-h-11 px-3"><option value="formal">격식</option><option value="neutral">중립</option><option value="friendly">친근함</option></select>
          </section>
        </div>

        <section className="mt-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3" aria-label="공개 데모 한도">
          <div><span className="text-xs font-bold text-muted-foreground">시작 한도</span><strong className="block text-lg">{PUBLIC_PRESS_RAG_LIMITS.starts}회 / 10분</strong></div>
          <div><span className="text-xs font-bold text-muted-foreground">남은 시작</span><strong className="block text-lg">{scenario?.quota.remainingStarts ?? PUBLIC_PRESS_RAG_LIMITS.starts}회</strong></div>
          <div><span className="text-xs font-bold text-muted-foreground">다시 시작 가능</span><strong className="block text-lg">{scenario?.quota.retryAfterSeconds ? `${scenario.quota.retryAfterSeconds}초 후` : "지금"}</strong></div>
        </section>

        <div className="mt-5" aria-live="polite" aria-atomic="true">
          {runner.busy ? <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 font-bold">서버에서 실행 중입니다…</p> : null}
          {runner.error ? <p role="alert" className="rounded-lg border border-rose-400 bg-rose-50 p-3 font-bold text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{runner.error}</p> : null}
        </div>

        {!scenario ? <button type="button" disabled={runner.busy || !memo.trim()} onClick={async () => acceptResult(await runner.start({ memo, tone }))} className={`${button} mt-5 w-full bg-primary text-primary-foreground sm:w-auto`}>시나리오 시작</button> : null}

        {scenario && attempt ? <div className="mt-7 min-w-0 space-y-5">
          <PressAiScenarioLineage attempts={scenario.attempts} activeAttemptId={inspected?.id ?? attempt.id} onSelect={(item) => { setInspectedAttemptId(item.id); setSelection(defaultWorkbenchSelection(item)); }} />

          {pending?.verdict === "BLOCK" ? <section className="rounded-xl border-2 border-rose-400 bg-rose-50 p-5 dark:bg-rose-950/20" aria-labelledby="scenario-repair-heading"><h2 id="scenario-repair-heading" className="text-xl font-black">근거와 다른 수치를 수정하세요</h2><p className="mt-1 text-sm">부모 시도의 BLOCK 관찰은 계보에 남고, 360억원만 200억원으로 교정한 자식 시도가 같은 정책을 다시 실행합니다.</p><label className="mt-4 block text-sm font-bold" htmlFor="scenario-repair-memo">수정 메모</label><textarea ref={repairRef} id="scenario-repair-memo" value={repairMemo} onChange={(event) => setRepairMemo(event.target.value)} rows={6} className="pt-input mt-1 min-h-36 resize-y px-3 py-2" /></section> : null}

          {attempt.activeNodeId === "draft-review" ? <label className="block rounded-xl border border-border bg-card p-4 text-sm font-bold">리뷰 지침<input value={reviewInstruction} onChange={(event) => setReviewInstruction(event.target.value)} maxLength={1000} className="pt-input mt-2 min-h-11 px-3" /></label> : null}

          {attempt.activeNodeId === "selected-rewrite" ? <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-black">반영할 리뷰 노트 선택</h2><div className="mt-3 grid gap-2">{reviewNotes.map((note) => <label key={note.id} className="flex min-h-11 items-center gap-3 rounded border border-border px-3"><input type="checkbox" checked={selectedNoteIds.includes(note.id)} onChange={(event) => setSelectedNoteIds((items) => event.target.checked ? [...items, note.id] : items.filter((id) => id !== note.id))} /><span><strong>{note.id}</strong> · {note.message}</span></label>)}</div><label className="mt-3 block text-sm font-bold">수정 지침<input value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} maxLength={1000} className="pt-input mt-1 min-h-11 px-3" /></label></section> : null}

          <div ref={nextActionRef} tabIndex={-1} className="sticky bottom-3 z-20 rounded-xl border border-primary/40 bg-card/95 p-4 shadow-lg backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><p className="text-xs font-black uppercase tracking-[0.14em] text-primary">지금 해야 할 작업</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><strong>{actionLabel}</strong><p className="text-xs text-muted-foreground">revision {attempt.revision} · 남은 명령 {scenario.commandsRemaining}회</p></div><button type="button" onClick={primaryAction} disabled={runner.busy || !rewriteReady || attempt.status === "COMPLETED"} className={`${button} bg-primary text-primary-foreground`}>{actionLabel}</button></div></div>

          {inspected ? <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="scenario-graph-heading"><div className="border-b border-border p-4"><h2 id="scenario-graph-heading" className="font-black">프로세스 그래프 · 선택 시도 {inspected.id}</h2></div><PressAiProcessGraph attempt={inspected as PressAiCheckpointAttempt} busy={runner.busy && inspected.id === attempt.id} selectedNodeId={selection?.kind === "node" ? selection.nodeId : null} selectedEdgeId={selection?.kind === "edge" ? selection.edgeId : null} onNode={(nodeId) => setSelection({ kind: "node", nodeId })} onEdge={(edgeId) => setSelection({ kind: "edge", edgeId })} process={publicPressRagScenarioProcess} /></section> : null}

          {inspected && selection ? <PressAiStateIoPanel attempt={inspected as PressAiCheckpointAttempt} busy={runner.busy} selection={selection} onSelectionChange={setSelection} attachedCase={null} caseLoading={false} caseError={null} caseSaved={false} caseActionStatus="IDLE" onSaveCase={() => {}} onSaveAndBranch={() => {}} process={publicPressRagScenarioProcess} showCasePanel={false} /> : null}

          {inspected ? <details className="rounded-xl border border-border bg-card"><summary className="min-h-11 cursor-pointer px-4 py-3 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">상세 실행 타임라인 펼치기</summary><div className="p-4"><PressAiRunTimeline attempt={inspected as PressAiCheckpointAttempt} busy={runner.busy} open={openRows} onOpenChange={setOpenRows} process={publicPressRagScenarioProcess} /></div></details> : null}

          {attempt.status === "COMPLETED" ? <section className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-5 dark:bg-emerald-950/20"><h2 className="text-xl font-black">시나리오 완료</h2><p className="mt-1 text-sm">부모/자식 계보, 두 리뷰 체크포인트, review-repeat self-loop, 선택 수정 결과가 모두 보존되었습니다.</p><button type="button" onClick={() => { runner.clear(); setMemo(PUBLIC_PRESS_RAG_GUIDED_MEMO); setRepairMemo(repairedScenarioMemo()); setSelectedNoteIds([]); }} className={`${button} mt-4 border border-border bg-card`}>새 시나리오 준비</button></section> : null}
        </div> : null}

        <p className="mt-8 text-xs leading-6 text-muted-foreground">로그인, 고객 Article, Prisma, 제품 할당량을 사용하지 않습니다. 새로고침하면 브라우저 메모리에만 있던 실행 표시 상태는 사라지지만, 세션 시작 한도 쿠키는 유지됩니다.</p>
      </div>
    </section>
  );
}
