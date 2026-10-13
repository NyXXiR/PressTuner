"use client";

import { useEffect, useRef, useState } from "react";
import type { QualityRunView } from "../../domain/press-workflow/evaluation/article-evaluation";
import type { Exposure } from "../../domain/press-workflow/evaluation/study-contracts";
import { errorCopy, reviewCommand, type ReportResponse, type StudySummary } from "./quality-study/adapter";
import { StudyClient } from "./quality-study/client";
import { ReviewCards, PairCard, buttonClass, primaryClass } from "./quality-study/ReviewCards";
import { StudyReport } from "./quality-study/StudyReport";

// Mount keyed by article: background history refreshes must not discard the
// active frozen review. The injected client is used only by isolated UI QA.
export function PressQualityStudyPanel({ articleId, run, stale, disabled, client: injectedClient }: {
  articleId: string; run: QualityRunView | null; stale: boolean; disabled?: boolean; client?: StudyClient;
}) {
  const client = useRef<StudyClient | null>(null), active = useRef(false), executing = useRef(false);
  const [study, setStudy] = useState<StudySummary | null>(null);
  const [studies, setStudies] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false), [exposure, setExposure] = useState<Exposure | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null), [pairId, setPairId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [purpose, setPurpose] = useState<"DEVELOPMENT" | "CALIBRATION" | "AUDIT">("DEVELOPMENT");
  const [experimentId, setExperimentId] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [view, setView] = useState<"review" | "pair" | "report">("review");
  const scope = `press-study-ui:${articleId}`;

  useEffect(() => {
    active.current = true;
    let live = true;
    let storage: Storage | undefined; try { storage = window.sessionStorage; } catch { /* Optional persistence. */ }
    const api = injectedClient ?? new StudyClient(scope, fetch, storage); client.current = api;
    const init = async () => {
      const rows = await api.list();
      if (!live) return;
      setStudies(rows); setPending(!!api.pending);
      if (api.savedId && !api.pending) { await api.open(api.savedId); if (live) { setStudy(api.current); if (!api.current?.batches.length && api.current?.pairs.length) setView("pair"); } }
    };
    void init().catch(e => { if (live) { setError(errorCopy(e)); setPending(!!api.pending); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; active.current = false; };
  }, [scope, injectedClient]);

  async function act(work: (api: StudyClient) => Promise<void>, success?: string) {
    if (executing.current || !client.current || disabled) return false;
    executing.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await work(client.current);
      if (active.current) { setStudy(client.current.current); setPending(!!client.current.pending); if (success) setNotice(success); }
      return true;
    } catch (e) { if (active.current) { setStudy(client.current.current); setPending(!!client.current.pending); setError(errorCopy(e)); } return false; }
    finally { executing.current = false; if (active.current) setBusy(false); }
  }
  async function startProduct(api: StudyClient) {
    if (!run || stale || run.status === "RUNNING") return;
    if (!api.current) await api.create(`원고 검토 · ${new Date().toLocaleDateString("ko-KR")}`);
    if (!active.current) return;
    if (!api.current!.frozenAt) {
      if (!api.current!.samples?.some(s => s.id === run.id)) await api.send({ action: "ADD_SAMPLES", samples: [{ articleId, runId: run.id, partition: "DEVELOPMENT" }] });
      if (!active.current) return;
      await api.send({ action: "FREEZE_DATASET" });
    }
    if (!active.current) return;
    const result = await api.send({ action: "ASSIGN_REVIEW", purpose: "PRODUCT" });
    setBatchId(result.resultRef ?? result.batches.filter(b => b.purpose === "PRODUCT").at(-1)?.id ?? null); setPairId(null); setReport(null); setView("review");
  }
  const batch = study?.batches.find(b => b.id === batchId) ?? study?.batches.find(b => b.items.some(i => !i.choice)) ?? study?.batches.at(-1);
  const pair = study?.pairs.find(p => p.id === pairId) ?? study?.pairs.find(p => !p.choice) ?? study?.pairs.at(-1);
  const experiments = study?.experiments ?? [];
  const experiment = experiments.find(e => e.id === experimentId) ?? experiments.at(-1);
  const targets = study?.samples?.filter(s => ["DEVELOPMENT", "HOLDOUT"].includes(s.partition)) ?? [];
  const targetId = targets.some(s => s.id === sampleId) ? sampleId : targets.find(s => s.id === run?.id)?.id ?? targets[0]?.id;
  const locked = busy || loading || pending || !!disabled;

  return <section id="quality-review" className="mt-5 min-w-0 rounded-xl border border-primary/30 bg-background p-4" aria-labelledby="quality-review-heading">
    <h2 id="quality-review-heading" className="text-lg font-semibold">필요한 것만 확인하고 결정하세요</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">원고와 근거를 함께 준비합니다. 한 번에 최대 3개, 선택하면 바로 저장됩니다.</p>
    {loading && <p role="status" className="mt-3 text-sm">저장된 검토를 확인하고 있습니다.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
    <p role="status" aria-live="polite" className="mt-2 text-sm">{busy ? "저장·처리 중입니다…" : notice}</p>
    {pending && <div className="mt-3 rounded-lg border border-amber-400 p-3 text-sm"><p>이전 요청의 완료 여부를 확인해야 합니다. 새로운 선택은 잠시 멈췄습니다.</p><button type="button" disabled={busy || !!disabled} className={`${buttonClass} mt-2`} onClick={() => void act(async api => { await api.retry(); }, "저장된 요청 결과를 확인했습니다.")}>같은 요청으로 결과 확인</button></div>}
    {!study && !loading && <div className="mt-4"><button type="button" className={primaryClass} disabled={locked || !run || stale || run.status === "RUNNING"} onClick={() => void act(startProduct)}>이 평가에서 검토 시작</button><p className="mt-2 text-xs text-muted-foreground">{!run ? "위에서 평가를 실행하면 검토할 내용을 준비할 수 있습니다." : stale ? "원고 또는 근거가 달라졌습니다. 현재 내용으로 평가한 뒤 검토를 시작해 주세요." : "기존 평가를 사용합니다. 새 모델 호출은 없으며, 검토 준비는 팀 관리자 권한이 필요합니다."}</p></div>}
    <details className="mt-4 text-sm"><summary className="cursor-pointer">팀의 다른 검토 이어가기</summary><div className="mt-2 flex flex-wrap gap-2"><select aria-label="저장된 검토 선택" value={study?.id ?? ""} disabled={locked} className="min-h-11 w-full min-w-0 max-w-lg rounded-lg border border-border bg-background p-2" onChange={e => { if (e.target.value) void act(async api => { await api.open(e.target.value); setBatchId(null); setPairId(null); setReport(null); setExposure(null); setExperimentId(""); setSampleId(""); setView(api.current?.batches.length ? "review" : api.current?.pairs.length ? "pair" : "review"); }); }}><option value="">검토 선택</option>{studies.map(s => <option key={s.id} value={s.id}>{s.name} · {s.id.slice(0, 6)}</option>)}</select><button type="button" className={buttonClass} disabled={locked} onClick={() => void act(async api => { setStudies(await api.list()); if (api.current) await api.open(api.current.id); })}>저장 상태 새로고침</button></div></details>
    {study && <>
      <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium">{study.name}</p><p className="mt-1 text-xs text-muted-foreground">평가 당시 저장한 원고를 검토합니다. 현재 편집 중인 내용과 다를 수 있습니다.</p></div>
      {run && study.samples && !study.samples.some(s => s.id === run.id) && <button type="button" className={`${buttonClass} mt-3`} disabled={locked || stale || run.status === "RUNNING"} onClick={() => void act(async api => { await api.create(`원고 검토 · ${new Date().toLocaleDateString("ko-KR")}`); if (active.current) await startProduct(api); })}>현재 선택한 평가로 새 검토 시작</button>}
      {!study.frozenAt && <button type="button" className={`${primaryClass} mt-3`} disabled={locked || !run || stale} onClick={() => void act(startProduct)}>중단된 검토 준비 이어가기</button>}
      <nav aria-label="검토할 내용 선택" className="mt-3 flex flex-wrap gap-2">
        {study.batches.length > 0 && <select aria-label="질문 묶음 선택" className="min-h-11 max-w-full rounded-lg border border-border bg-background p-2 text-sm" disabled={locked} value={batch?.id ?? ""} onChange={e => { setBatchId(e.target.value); setView("review"); setReport(null); setExposure(null); }}>{study.batches.map((b, i) => <option key={b.id} value={b.id}>{b.purpose === "PRODUCT" ? "원고 검토" : "평가기 검증"} {i + 1} · {b.items.filter(x => x.choice).length}/{b.items.length}개 저장</option>)}</select>}
        {batch && <button type="button" className={buttonClass} disabled={locked} onClick={() => { setView("review"); setReport(null); }}>질문 보기</button>}
        {study.pairs.map((p, i) => <button key={p.id} type="button" className={buttonClass} disabled={locked} onClick={() => { setPairId(p.id); setView("pair"); setReport(null); setExposure(null); }}>A/B 비교 {i + 1}{p.choice ? " · 저장됨" : ""}</button>)}
      </nav>
      {batch && view === "review" && <ReviewCards key={batch.id} batch={batch} busy={locked} exposure={exposure} setExposure={setExposure} onChoose={(item, choice) => act(async api => { await api.send(reviewCommand(batch, item, choice, exposure)); setReport(null); }, "선택이 저장됐습니다.")} />}
      {study.frozenAt && view === "review" && (!batch || batch.items.every(i => i.choice)) && <button type="button" className={`${buttonClass} mt-3`} disabled={locked} onClick={() => void act(async api => { const result = await api.send({ action: "ASSIGN_REVIEW", purpose: "PRODUCT" }); setBatchId(result.resultRef ?? result.batches.filter(b => b.purpose === "PRODUCT").at(-1)?.id ?? null); setReport(null); setView("review"); })}>필요하면 다음 항목 확인</button>}
      <details className="mt-5 text-sm"><summary className="cursor-pointer font-medium">평가기 검증에 참여하기 (선택)</summary><p className="my-3 text-xs leading-5 text-muted-foreground">원고를 수정할지 고르는 일과 별개입니다. 자동 평가 설명을 숨긴 질문에 답합니다. 이전 설명을 보았다면 독립 판정으로 집계되지 않을 수 있습니다.</p><div className="flex flex-wrap gap-2"><select aria-label="평가기 검증 목적" className="min-h-11 rounded-lg border border-border bg-background p-2" value={purpose} disabled={locked} onChange={e => setPurpose(e.target.value as typeof purpose)}><option value="DEVELOPMENT">개선 사례 확인</option><option value="CALIBRATION">평가 기준 보정</option><option value="AUDIT">별도 사례로 정확도 확인</option></select><button type="button" className={buttonClass} disabled={locked || !study.frozenAt} onClick={() => void act(async api => { const result = await api.send({ action: "ASSIGN_REVIEW", purpose }); setBatchId(result.resultRef ?? result.batches.filter(b => b.purpose === purpose).at(-1)?.id ?? null); setReport(null); setExposure(null); setView("review"); })}>검증 질문 받기</button></div></details>
      {pair && view === "pair" && <PairCard key={pair.id} pair={pair} busy={locked} exposure={exposure} setExposure={setExposure} onChoose={choice => void act(async api => { if (!exposure) throw new Error("EXPOSURE_REQUIRED"); await api.send({ action: "SUBMIT_PAIRWISE", pairId: pair.id, choice, priorExposure: exposure, voteRevision: pair.revision }); setReport(null); }, "비교 선택이 저장됐습니다.")} />}
      {study.samples && <details className="mt-5 text-sm"><summary className="cursor-pointer font-medium">개선 후보 준비·비교 (관리자)</summary>
        <p className="my-3 text-xs leading-5 text-muted-foreground">확인된 실패에서 개선 지침을 준비합니다. 준비만으로 모델을 호출하지 않습니다. 생성·평가는 아래 실행 버튼을 누를 때만 진행합니다.</p>
        <div className="flex flex-wrap gap-2"><select aria-label="개선 비교할 평가" value={targetId ?? ""} disabled={locked} className="min-h-11 min-w-0 max-w-full rounded-lg border border-border bg-background p-2" onChange={e => setSampleId(e.target.value)}>{targets.map((s, i) => <option key={s.id} value={s.id}>{s.id === run?.id ? "현재 선택한 평가" : `저장된 평가 ${i + 1}`} · {s.partition === "HOLDOUT" ? "새 사례" : "개선용 사례"}</option>)}</select><button type="button" className={buttonClass} disabled={locked || !targetId || !study.frozenAt} onClick={() => void act(async api => { const result = await api.send({ action: "PLAN_EXPERIMENT", sampleIds: [targetId!] }); setExperimentId(result.experiments?.at(-1)?.id ?? ""); setReport(null); }, "개선 비교를 준비했습니다. 아직 모델을 호출하지 않았습니다.")}>개선 비교 준비</button></div>
        {experiment && <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
          <select aria-label="저장된 개선 비교" value={experiment.id} disabled={locked} className="min-h-11 max-w-full rounded-lg border border-border bg-background p-2" onChange={e => setExperimentId(e.target.value)}>{experiments.map((e, i) => <option key={e.id} value={e.id}>개선 비교 {i + 1} · 완료 {e.steps.filter(s => s.status === "COMPLETED").length}/{e.steps.length}</option>)}</select>
          <p>생성·평가 {experiment.steps.filter(s => s.status === "COMPLETED").length} / {experiment.steps.length}단계 완료</p>
          {experiment.steps.some(s => ["FAILED", "INTERRUPTED"].includes(s.status)) && <p>완료하지 못한 실행이 있습니다. 저장된 결과를 확인한 뒤 새 비교를 준비해 주세요.</p>}
          {experiment.steps.some(s => s.status === "RUNNING") && <p>실행 중입니다. 저장 상태를 새로고침해 완료 여부를 확인해 주세요.</p>}
          <button type="button" className={buttonClass} disabled={locked || experiment.steps.some(s => ["RUNNING", "FAILED", "INTERRUPTED"].includes(s.status)) || !experiment.steps.some(s => s.status === "PENDING")} onClick={() => void act(async api => {
            setReport(null);
            // Bound each click to one article's 2 generations + 2 evaluations.
            for (let i = 0; i < 4 && active.current; i++) {
              const e = api.current?.experiments?.find(x => x.id === experiment.id);
              if (!e || e.steps.some(s => ["RUNNING", "FAILED", "INTERRUPTED"].includes(s.status)) || !e.steps.some(s => s.status === "PENDING")) break;
              await api.send({ action: "RUN_STEP", experimentId: e.id, allowModelSpend: true });
              if (active.current) setStudy(api.current);
            }
          }, "실행 상태가 저장됐습니다. 완료 여부를 확인해 주세요.")}>생성·평가 실행 또는 이어가기 (최대 4단계)</button>
          <p className="text-xs text-muted-foreground">모델 사용 비용이 발생합니다. 한 원문의 전체 비교는 생성 2회·평가 2회이며 평가 내부 호출은 더 많을 수 있습니다. 오류나 화면 이탈 후에는 자동으로 다음 단계를 실행하지 않습니다.</p>
          {experiment.sampleIds.map((id, i) => <button key={id} type="button" className={`${buttonClass} mr-2`} disabled={locked || experiment.steps.filter(s => s.sampleId === id).some(s => s.status !== "COMPLETED")} onClick={() => void act(async api => { const result = await api.send({ action: "ASSIGN_PAIRWISE", experimentId: experiment.id, sampleId: id }); setPairId(result.resultRef ?? result.pairs.at(-1)?.id ?? null); setReport(null); setExposure(null); setView("pair"); })}>초안 {i + 1}의 A/B 비교 열기</button>)}
        </div>}
        <div className="mt-4 rounded-lg border border-border p-3"><p className="mb-2 text-xs leading-5 text-muted-foreground">결과를 열면 자동 평가와 후보 정보가 표시됩니다. 독립 검토를 하려면 선택을 먼저 마쳐 주세요.</p><button type="button" className={buttonClass} disabled={locked} onClick={() => void act(async api => { setReport(await api.report()); setExposure("SEEN_JUDGE"); setView("report"); })}>결과와 개선 제안 보기</button></div>
      </details>}
      {report && view === "report" && <StudyReport data={report} busy={locked} onDecide={(id, choice) => void act(async api => { await api.send({ action: "DECIDE", experimentId: id, choice }); setReport(await api.report()); }, "결정이 저장됐습니다. 원고와 운영 설정은 변경되지 않았습니다.")} />}
    </>}
  </section>;
}
