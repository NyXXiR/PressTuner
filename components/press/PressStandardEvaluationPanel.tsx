"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { standardDraftText } from "@/domain/press-workflow/evaluation/standard";
import type { ArticleQualityState, QualityKind, QualityRequest, QualityRunView } from "@/domain/press-workflow/evaluation/article-evaluation";
import { PressQualityStudyPanel } from "./PressQualityStudyPanel";
import { qualitySummary } from "./quality-edit/adapter";
import { buttonClass, primaryClass } from "./quality-study/ReviewCards";

const labels: Record<string, string> = { RAGAS: "Ragas · Faithfulness", DEEPEVAL: "DeepEval · Faithfulness", FACTUAL_SUPPORT: "사실 근거", PROMOTIONAL_CLAIMS: "근거 없는 과장", REQUIRED_FACTS: "필수 사실 포함", STYLE_LEAKAGE: "문체 예시의 사실 혼입", REQUESTED_STYLE: "요청 문체" };
const statuses = { RUNNING: "평가 중", COMPLETED: "평가 완료", PARTIAL: "일부 평가 실패", FAILED: "평가 실패", INTERRUPTED: "중단·미완료" };
const failureCopy = { TIMEOUT: "평가 시간이 초과됐습니다.", NO_CLAIMS: "평가할 주장을 추출하지 못했습니다.", INVALID_RESULT: "평가 결과 형식을 확인하지 못했습니다.", PROVIDER_ERROR: "평가 모델 호출에 실패했습니다." };
const kindLabel = (kind: QualityKind) => kind === "STANDARD" ? "표준 평가" : "업무 평가";

export function PressStandardEvaluationPanel({ articleId, title, plain, refreshKey, disabled, saveDraft, onRequestRevision, revisionBusy }: {
  articleId: string; title: string; plain: string; refreshKey?: string; disabled?: boolean; saveDraft: () => Promise<boolean>;
  onRequestRevision?: (run: QualityRunView) => Promise<void>; revisionBusy?: boolean;
}) {
  const [state, setState] = useState<ArticleQualityState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<QualityKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const currentArticle = useRef(articleId), pending = useRef(false), requestSequence = useRef(0);
  const endpoint = `/api/articles/${encodeURIComponent(articleId)}/quality-evaluation`;
  const storageKey = `press-quality-pending:${articleId}`;
  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    const response = await fetch(endpoint, { cache: "no-store", credentials: "include", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "평가 이력을 읽지 못했습니다.");
    if (!signal?.aborted && currentArticle.current === articleId && sequence === requestSequence.current) {
      setState(data); setLoadError(null);
      setSelectedId(id => data.history.some((r: QualityRunView) => r.id === id) ? id : data.history[0]?.id ?? null);
    }
  }, [endpoint, articleId]);
  useEffect(() => {
    currentArticle.current = articleId; setState(null); setSelectedId(null); setError(null); setLoadError(null);
    return () => { currentArticle.current = ""; };
  }, [articleId]);
  useEffect(() => {
    void refreshKey;
    const controller = new AbortController();
    const refresh = () => { void load(controller.signal).catch(e => { if (!controller.signal.aborted) setLoadError(e instanceof Error ? e.message : "평가 이력을 읽지 못했습니다."); }); };
    refresh(); window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, [load, refreshKey]);
  const running = state?.history.some(r => r.status === "RUNNING") ?? false;
  useEffect(() => {
    if (!busy && !running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(controller.signal); } catch { if (!controller.signal.aborted) setLoadError("진행 상태를 확인하지 못했습니다. 저장된 이력을 다시 확인해 주세요."); }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 6000);
    };
    timer = setTimeout(() => void poll(), 6000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [busy, running, load]);

  async function run(kind: QualityKind, retryOfId?: string) {
    if (pending.current) return;
    const target = articleId, expectedOutput = standardDraftText(title, plain);
    pending.current = true; setBusy(kind); setError(null);
    try {
      if (!(await saveDraft())) throw new Error("원고를 저장하지 못했습니다. 저장 상태를 확인해 주세요.");
      if (currentArticle.current !== target) return;
      let request: QualityRequest = { kind, expectedOutput, idempotencyKey: crypto.randomUUID(), ...(retryOfId ? { retryOfId } : {}) };
      // Preserve an ambiguous request's key across reload, without automatically retrying.
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") as QualityRequest | null;
        if (saved?.kind === kind && saved.expectedOutput === expectedOutput && saved.retryOfId === retryOfId) request = saved;
        sessionStorage.setItem(storageKey, JSON.stringify(request));
      } catch { /* The request still has an idempotency key when browser storage is disabled. */ }
      const response = await fetch(endpoint, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) { try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ } }
        throw new Error(data.message || "평가를 실행하지 못했습니다.");
      }
      try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
      if (currentArticle.current !== target) return;
      setSelectedId(data.result.id);
      setState(previous => previous ? { ...previous, history: [data.result, ...previous.history.filter(r => r.id !== data.result.id)].slice(0, 10) } : previous);
      await load().catch(() => { if (currentArticle.current === target) setLoadError("결과는 저장됐지만 이력을 다시 확인하지 못했습니다. 연결을 다시 확인해 주세요."); });
    } catch (e) { if (currentArticle.current === target) setError(e instanceof Error ? e.message : "평가를 실행하지 못했습니다."); }
    finally { pending.current = false; setBusy(null); }
  }

  const current = state?.history.find(r => r.id === selectedId) ?? null;
  // The author view follows the latest business check; inspecting a historical
  // metric in the advanced area must not silently change the suggested action.
  const authorRun = state?.history.find(r => r.kind === "GEVAL") ?? state?.history[0] ?? null;
  const authorStale = !!authorRun && (authorRun.freshness === "STALE" || state?.fingerprint !== authorRun.fingerprint || authorRun.output !== standardDraftText(title, plain));
  const summary = authorRun ? qualitySummary(authorRun) : null;
  const stale = current && (current.freshness === "STALE" || state?.fingerprint !== current.fingerprint || current.output !== standardDraftText(title, plain));
  const canRetry = current && !stale && ["PARTIAL", "FAILED", "INTERRUPTED"].includes(current.status);
  return <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="quality-evaluation-heading">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="quality-evaluation-heading" className="scroll-mt-40 text-lg font-bold">원고에서 고칠 곳 찾기</h2>
    <p className="mt-2 text-sm text-muted-foreground">작성 자료와 다른 내용, 근거 없는 과장을 확인해 드려요.</p></div>
    <button type="button" className={primaryClass} disabled={!!busy || running || disabled || !state || !!state.inputReason || !state.runtimes.GEVAL.available} onClick={() => void run("GEVAL")}>
      {busy || running ? "원고 확인 중…" : authorRun ? "현재 원고 다시 확인" : "원고 확인하기"}
    </button></div>
    <p className="mt-2 text-xs text-muted-foreground">실행하면 원고를 저장한 뒤 AI로 확인합니다. 평가 모델 사용 비용이 발생할 수 있어요.</p>
    {state?.inputReason && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{state.inputReason}</p>}
    {state && !state.runtimes.GEVAL.available && <p className="mt-3 text-sm">원고 확인 기능을 준비 중이에요. 잠시 후 다시 시도해 주세요.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {loadError && <div role="alert" className="mt-3 text-sm"><p>저장된 확인 결과를 불러오지 못했어요.</p><button type="button" className={`${buttonClass} mt-2`} onClick={() => void load().catch(() => setLoadError("다시 연결하지 못했습니다."))}>다시 불러오기</button></div>}
    {authorStale ? <p role="status" className="mt-4 rounded-lg bg-amber-500/10 p-4 text-sm">원고나 작성 자료가 바뀌었어요. 현재 원고를 다시 확인해 주세요. 이전 점수는 기록에서 볼 수 있어요.</p>
      : summary && authorRun && authorRun.status !== "RUNNING" ? <div className="mt-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold">{summary.title}</h3>
        {summary.issues.length > 0 && <ul className="mt-3 space-y-3">{summary.issues.map(issue => <li key={issue.id}><p className="text-sm font-medium">{issue.title}</p>{issue.reason && <details className="mt-1 text-sm text-muted-foreground"><summary className="cursor-pointer">자동 확인 내용 보기</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{issue.reason}</p></details>}</li>)}</ul>}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{summary.detail}</p>
        {summary.issues.length > 0 && onRequestRevision && <div className="mt-4 border-t border-border pt-4"><button type="button" className={primaryClass} disabled={disabled || !!busy || running || revisionBusy} onClick={() => void onRequestRevision(authorRun)}>{revisionBusy ? "수정안 준비 중…" : "고칠 부분의 수정안 받기"}</button><p className="mt-2 text-xs leading-5 text-muted-foreground">첨삭 후 최대 3개 제안을 재작성해요. 기존 첨삭·재작성 사용량이 차감되며 AI를 최대 2회 호출합니다. 준비된 수정안은 반영 전에 확인할 수 있어요.</p></div>}
      </div> : !state && !loadError ? <p role="status" className="mt-4 text-sm text-muted-foreground">저장된 확인 결과를 불러오고 있어요.</p> : !authorRun ? <p className="mt-4 text-sm text-muted-foreground">원고를 확인하면 여기서 고칠 내용과 다음 행동을 안내해 드려요.</p> : null}
    <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">평가 방법·점수·기록</summary>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {(["STANDARD", "GEVAL"] as const).map(kind => <div key={kind} className="border border-border p-3">
        <h3 className="text-sm font-bold">{kind === "STANDARD" ? "근거와 맞는지 확인" : "사실·과장 표현 확인"}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{kind === "STANDARD" ? "주장이 근거로 뒷받침되는지, 근거와 모순되는지 확인합니다." : "사실 근거와 과장 표현을 업무별 기준으로 확인합니다. 사람 기준 보정 전의 평가입니다."}</p>
        <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">평가 방법</summary><p className="mt-1">{kind === "STANDARD" ? "Ragas / DeepEval Faithfulness" : "DeepEval G-Eval"} · {state ? state.runtimes[kind].profile.model : "환경 확인 중…"}</p></details>
        <button type="button" onClick={() => void run(kind)} disabled={!!busy || running || disabled || !state || !!state.inputReason || !state.runtimes[kind].available}
          className="mt-3 border border-primary bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy === kind ? `${kindLabel(kind)} 중…` : `${kindLabel(kind)} 실행`}
        </button>
        {state?.runtimes[kind].reason && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{state.runtimes[kind].reason}</p>}
      </div>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{state ? `채택한 사실 ${state.contextCount}개 · 실행하면 원고를 저장하고 평가 모델을 호출합니다. 결과와 실행 이력은 자동 저장됩니다.` : "저장된 평가 이력을 불러오고 있습니다."}</p>
    {(busy || running) && <p role="status" className="mt-3 text-sm">평가 중입니다. 완료되는 항목부터 저장합니다. 화면을 다시 열어도 실행 이력을 확인할 수 있습니다.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="min-w-0 text-sm">저장된 평가 이력
        <select aria-label="저장된 평가 이력" className="ml-2 max-w-full border border-border bg-background p-2 text-sm" value={selectedId ?? ""} onChange={e => setSelectedId(e.target.value)}>
          {!state?.history.length && <option value="">아직 평가가 없습니다</option>}
          {state?.history.map(r => <option key={r.id} value={r.id}>{kindLabel(r.kind)} · {new Date(r.createdAt).toLocaleString("ko-KR")} · {statuses[r.status]}</option>)}
        </select>
      </label>
      <button type="button" className="border border-border px-3 py-2 text-sm" onClick={() => void load().catch(e => setLoadError(e instanceof Error ? e.message : "연결을 확인해 주세요."))}>이력 새로고침</button>
    </div>
    {stale && <p role="status" className="mt-3 border border-amber-400 p-3 text-sm">원고나 근거가 변경됐습니다. 아래는 이전 내용의 결과입니다.</p>}
    {current ? <>
      <p className="mt-4 text-sm font-bold">{kindLabel(current.kind)} · {statuses[current.status]}</p>
      {current.status === "INTERRUPTED" && <p className="mt-2 text-sm">실행이 끝까지 저장되지 않았습니다. 완료된 항목은 보존돼 있습니다.</p>}
      {canRetry && <button type="button" className="mt-2 border border-border px-3 py-2 text-sm" disabled={!!busy || running || disabled || !state?.runtimes[current.kind].available} onClick={() => void run(current.kind, current.id)}>실패·미완료 항목만 다시 평가</button>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {current.profile.metrics.map(definition => {
          const metric = current.results.find(m => m.id === definition.id);
          return <section key={definition.id} className="min-w-0 border border-border p-4">
            <h3 className="font-bold">{labels[definition.id] ?? definition.id}</h3>
            {definition.id === "DEEPEVAL" && <p className="mt-2 text-xs leading-5 text-muted-foreground">근거와의 모순을 평가하며, 기본 설정에서는 애매한 주장에 벌점을 주지 않습니다.</p>}
            <p className="mt-3 text-2xl font-semibold tabular-nums">{!metric ? current.status === "RUNNING" ? "평가 중" : "미완료" : metric.state === "NOT_APPLICABLE" ? "평가 기준 없음" : metric.score === null ? "평가 실패" : <>{metric.score.toFixed(3)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ 1</span></>}</p>
            {metric?.state === "NOT_APPLICABLE" ? <p className="mt-2 text-sm leading-6">{metric.reason}</p>
              : metric?.reasonCode ? <p className="mt-2 text-sm">{failureCopy[metric.reasonCode]}</p>
                : metric && <p className="mt-2 text-xs text-muted-foreground">{metric.threshold === null ? "점수 제공 · 기본 합격 기준 없음" : `${current.kind === "GEVAL" ? "실험" : "라이브러리 기본"} 기준 ${metric.threshold} ${metric.thresholdPassed ? "충족" : "미달"}${current.kind === "GEVAL" ? " · 사람 기준 보정 전" : ""}`}</p>}
            {metric && metric.state !== "NOT_APPLICABLE" && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">평가 설명과 실행 정보</summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{metric.reason || (metric.id === "RAGAS" && metric.score !== null ? "공식 점수를 반환하며 별도의 설명을 생성하지 않습니다." : "설명을 얻지 못했습니다.")}</p>
              <p className="mt-3 text-xs text-muted-foreground">버전 {metric.version} · {(metric.elapsedMs / 1000).toFixed(1)}초 · {metric.usage ? `입력 ${metric.usage.inputTokens} / 출력 ${metric.usage.outputTokens} tokens` : "사용량 미확인"}{metric.reusedFromRunId ? " · 이전 시도의 완료 결과 재사용" : ""}</p>
            </details>}
          </section>;
        })}
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer">평가한 원고와 조건</summary>
        <p className="mt-2 text-xs text-muted-foreground">모델 {current.profile.model} · 근거 {current.contextCount}개 · 설정 {current.profile.version} · 실행 {current.id}</p>
        <p className="mt-2 break-all text-xs text-muted-foreground">원고·근거 버전 {current.fingerprint.slice(0, 12)} · 평가 설정 {current.profileHash.slice(0, 12)}</p>
        <p className="mt-3 whitespace-pre-wrap break-words leading-6">{current.output}</p>
      </details>
    </> : <p className="mt-4 border border-dashed border-border p-4 text-sm text-muted-foreground">위에서 평가를 실행하면 이곳에 결과가 저장됩니다.</p>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">최근 10회 이력을 표시합니다. 지표별 점수를 합산하지 않으며, 평가 결과가 최종 확정을 대신하지 않습니다.</p>
    </details>
    <div className="mt-4 border-t border-border pt-4"><button type="button" className="min-h-11 text-sm text-muted-foreground underline underline-offset-4" aria-expanded={researchOpen} onClick={() => setResearchOpen(value => !value)}>평가기 관리 {researchOpen ? "닫기" : "열기"}</button>
      {researchOpen && <div className="mt-2"><p className="text-sm text-muted-foreground">평가기 신뢰도 검증과 개선 실험을 위한 영역입니다. 원고를 수정하려면 위의 수정안 받기를 이용하세요.</p><PressQualityStudyPanel key={articleId} articleId={articleId} run={current} stale={!!stale} disabled={disabled || !!busy || running} /></div>}
    </div>
  </section>;
}
