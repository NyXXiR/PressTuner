"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { draftChanges, sameDraft, selectChanges, type Draft, type CommitResult } from "./adapter";
import type { Note, SaveState } from "../../../stores/usePressEditStore";
import { buttonClass, primaryClass } from "../quality-study/ReviewCards";

type Decision = "APPLY" | "KEEP" | "LATER";
type Fact = { id: string; content: string; active: boolean };

function ChangedText({ value, other }: { value: string; other: string }) {
  let start = 0, end = 0;
  while (start < Math.min(value.length, other.length) && value[start] === other[start]) start++;
  while (end < Math.min(value.length, other.length) - start && value[value.length - end - 1] === other[other.length - end - 1]) end++;
  // Keep a changed number visually whole (73,000 → 7,300), not just "3,0".
  const number = [...value.matchAll(/\d[\d,.]*/g)].find(m => m.index! <= start && m.index! + m[0].length >= value.length - end);
  if (number) { start = number.index!; end = value.length - start - number[0].length; }
  return <p className="whitespace-pre-wrap break-words text-sm leading-7">{value.slice(0, start)}<mark className="rounded bg-primary/15 px-0.5 font-semibold text-foreground">{value.slice(start, value.length - end)}</mark>{end ? value.slice(-end) : ""}</p>;
}

export function DraftRevisionChoices({ articleId, base, candidate, current, notes = [], saveState, disabled, onCommit, onRetrySave, onClose }: {
  articleId: string; base: Draft; candidate: Draft; current: Draft; notes?: Note[]; saveState: SaveState; disabled?: boolean;
  onCommit: (expected: Draft, next: Draft) => Promise<CommitResult>; onRetrySave: () => Promise<boolean>; onClose: () => void;
}) {
  const changes = useMemo(() => draftChanges(base, candidate), [base, candidate]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [revisit, setRevisit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [factsError, setFactsError] = useState(false);
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), committing = useRef(false);
  const applied = Object.keys(decisions).filter(id => decisions[id] === "APPLY");
  const expected = selectChanges(base, changes, applied);
  const stale = !busy && !sameDraft(current, expected);
  const change = changes.find(c => c.id === revisit) ?? changes.find(c => !decisions[c.id]);
  const previous = useRef(change?.id);
  useEffect(() => { if (previous.current !== change?.id) heading.current?.focus(); previous.current = change?.id; }, [change?.id]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/articles/${encodeURIComponent(articleId)}/grounding`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("GROUNDING_UNAVAILABLE"); const data = await r.json(); setFacts((data.facts ?? []).filter((f: Fact) => f.active)); })
      .catch(() => { if (!controller.signal.aborted) setFactsError(true); });
    return () => controller.abort();
  }, [articleId]);

  async function commit(id: string, undo = false) {
    if (committing.current || stale || disabled) return;
    committing.current = true; setBusy(true); setMessage(null);
    try {
      const nextApplied = undo ? applied.filter(item => item !== id) : [...applied, id];
      const result = await onCommit(expected, selectChanges(base, changes, nextApplied));
      if (result === "STALE") { setMessage("원고가 변경됐어요. 수정안을 닫고 현재 원고에서 다시 시작해 주세요."); return; }
      setDecisions(old => { const next = { ...old }; if (undo) delete next[id]; else next[id] = "APPLY"; return next; });
      setLastApplied(undo ? null : id); setRevisit(undo ? id : null);
      setMessage(result === "SAVED" ? undo ? "이 변경을 되돌리고 저장했어요." : "선택한 부분을 원고에 반영하고 저장했어요." : "원고에는 반영됐지만 저장하지 못했어요. 아래에서 다시 저장해 주세요.");
    } catch { setMessage("저장 결과를 확인하지 못했어요. 원고와 저장 상태를 확인해 주세요."); }
    finally { committing.current = false; setBusy(false); }
  }
  const related = change ? notes.filter(n => n.quote && change.before.includes(n.quote)) : [];
  const sourceIds = new Set(related.flatMap(n => n.sourceFactIds ?? []));
  const sources = facts.filter(f => sourceIds.has(f.id));
  const deferred = changes.filter(c => decisions[c.id] === "LATER");
  const locked = busy || disabled || saveState === "saving";

  return <section aria-label="바뀐 부분 검토" className="scroll-mt-24 rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold text-primary">수정안 준비 완료</p><h2 className="mt-1 text-lg font-bold">바뀐 부분만 골라 반영하세요</h2><p className="mt-2 text-sm text-muted-foreground">반영을 누른 부분만 원고에 저장돼요. 전체 원고를 다시 읽을 필요 없이 한 곳씩 확인하세요.</p></div>
      <button type="button" className={buttonClass} disabled={busy} onClick={onClose}>수정안 닫기</button>
    </div>
    <p className="mt-4 text-sm" aria-live="polite">{Object.keys(decisions).length} / {changes.length}곳 선택 · {applied.length}곳 반영</p>
    {stale && <p role="alert" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">원고가 변경되어 이 수정안을 반영할 수 없어요. 직접 입력한 내용을 보존했습니다. 수정안을 닫고 다시 확인해 주세요.</p>}
    {saveState === "error" && <div role="alert" className="mt-3 rounded-lg border border-red-500/40 p-3 text-sm"><p>아직 저장되지 않은 변경이 있어요.</p><button type="button" className={`${buttonClass} mt-2`} disabled={locked} onClick={async () => { setBusy(true); try { setMessage(await onRetrySave() ? "원고를 저장했어요." : "저장하지 못했어요. 연결 상태를 확인해 주세요."); } finally { setBusy(false); } }}>다시 저장</button></div>}
    {change ? <div className="mt-4 space-y-4" key={change.id}>
      <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">{change.field === "title" ? "제목" : "본문"} 변경 {changes.indexOf(change) + 1}</h3>
      {related.length > 0 && <p className="text-sm leading-6">{related.map(n => n.note).join(" ")}</p>}
      <div className="grid min-w-0 gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))" }}>
        <div className="min-w-0 rounded-lg border border-border bg-background p-4"><p className="mb-2 text-xs font-semibold text-muted-foreground">현재 문장</p>{change.before.trim() ? <ChangedText value={change.before} other={change.after} /> : <p className="text-sm text-muted-foreground">새로 추가되는 내용</p>}</div>
        <div className="min-w-0 rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="mb-2 text-xs font-semibold text-primary">제안 문장</p>{change.after.trim() ? <ChangedText value={change.after} other={change.before} /> : <p className="text-sm">이 부분을 삭제합니다.</p>}</div>
      </div>
      {sources.length > 0 && <div className="rounded-lg bg-muted/50 p-3 text-sm leading-6"><p className="font-semibold">첨삭이 참조한 자료</p>{sources.map(f => <p key={f.id} className="mt-2 whitespace-pre-wrap break-words">{f.content}</p>)}</div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryClass} disabled={locked || stale || saveState === "error"} onClick={() => void commit(change.id)}>이 수정 반영</button>
        <button type="button" className={buttonClass} disabled={locked || stale} onClick={() => { setDecisions(old => ({ ...old, [change.id]: "KEEP" })); setRevisit(null); }}>현재 문장 유지</button>
        <button type="button" className={buttonClass} disabled={locked || stale} onClick={() => { setDecisions(old => ({ ...old, [change.id]: "LATER" })); setRevisit(null); }}>나중에 확인</button>
      </div>
      <p className="text-xs text-muted-foreground">AI가 만든 수정안이에요. 이름·수치·인용은 자료와 함께 확인해 주세요.</p>
    </div> : <div className="mt-4 rounded-lg bg-muted/40 p-4" role="status"><h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">{changes.length ? "이번 선택을 마쳤어요" : "제안된 변경이 없어요"}</h3><p className="mt-2 text-sm">{deferred.length ? `${deferred.length}곳은 나중에 확인하도록 남겨뒀어요.` : "선택한 수정만 반영됐어요. 원고 확인을 다시 실행하면 수정 후 결과를 볼 수 있어요."}</p></div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {lastApplied && <button type="button" className={`${buttonClass} mt-3`} disabled={locked || stale} onClick={() => void commit(lastApplied, true)}>방금 반영 되돌리기</button>}
    {deferred.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{deferred.map(c => <button key={c.id} type="button" className={buttonClass} disabled={locked || stale} onClick={() => setRevisit(c.id)}>미룬 변경 {changes.indexOf(c) + 1} 다시 보기</button>)}</div>}
    <details className="mt-4 text-sm"><summary className="cursor-pointer">작성 자료 전체 보기</summary>{factsError ? <p className="mt-2">자료를 불러오지 못했어요. 연결 상태를 확인해 주세요.</p> : <ul className="mt-3 max-h-64 space-y-3 overflow-auto">{facts.map(f => <li key={f.id} className="whitespace-pre-wrap break-words leading-6">{f.content}</li>)}{!facts.length && <li>표시할 자료가 없습니다.</li>}</ul>}</details>
  </section>;
}
