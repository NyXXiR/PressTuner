"use client";

import { criterionLabels, decisionView, type ExperimentReport, type ReportResponse } from "./adapter";
import { buttonClass } from "./ReviewCards";

const percent = (value: number | null) => value === null ? "미측정" : `${(value * 100).toFixed(1)}%`;
const decisions = { KEEP_BASELINE: "기존안 유지", MORE_EVIDENCE: "추가 검증", HOLD: "판단 보류", SELECT_CANDIDATE: "개선안 채택 기록" };
export type DecisionChoice = keyof typeof decisions;

export function StudyReport({ data, busy, onDecide }: { data: ReportResponse; busy: boolean; onDecide: (id: string, choice: DecisionChoice) => void }) {
  return <section className="mt-4 space-y-4" aria-label="품질과 개선 결과">
    <h3 className="text-lg font-semibold">평가를 얼마나 믿을 수 있나요?</h3>
    <p className="text-sm text-muted-foreground">사람의 독립 판정과 비교한 결과입니다. 검토 의견이나 단순한 점수 상승은 정확도·개선 효과를 입증하지 않습니다.</p>
    {data.report.metrics.map(metric => <article key={`${metric.profileHash}/${metric.partition}/${metric.metricId}`} className="rounded-lg border border-border p-3 text-sm">
      <h4 className="font-semibold">{criterionLabels[metric.metricId] ?? metric.metricId} · {({ DEVELOPMENT: "개선용 사례", CALIBRATION: "보정용 사례", AUDIT: "독립 검사", HOLDOUT: "새 비교 사례" })[metric.partition]}</h4>
      <p className="mt-2 font-medium">{metric.reliability === "INSUFFICIENT" ? "아직 신뢰도를 판단할 자료가 부족합니다" : "이번 독립 검사에서 관측한 결과입니다"}</p>
      <p className="mt-1">비교 {metric.compared}건 / 사람 판정 {metric.labeled}건 · 원문 {metric.groups}개 · 판정 가능 비율 {percent(metric.coverage)}</p>
      <details className="mt-2"><summary className="cursor-pointer">놓친 문제와 잘못된 경고 확인</summary><dl className="mt-2 grid grid-cols-2 gap-2"><dt>놓친 문제</dt><dd>{metric.falseNegative}건</dd><dt>잘못된 경고</dt><dd>{metric.falsePositive}건</dd><dt>결함 탐지율</dt><dd>{percent(metric.endToEndDefectRecall)}</dd><dt>오탐률</dt><dd>{percent(metric.falsePositiveRate)}</dd></dl><p className="mt-2 text-xs text-muted-foreground">비교할 수 없는 사람 판정 {metric.unavailable}건 · 정답 미확정 {metric.unlabeledOrUncertain}건. 비율은 이 사례 묶음에 한정됩니다.</p></details>
    </article>)}
    {!data.report.metrics.length && <p className="text-sm">신뢰도를 계산할 평가와 사람 판정이 아직 없습니다.</p>}
    <details className="text-sm"><summary className="cursor-pointer">평가자 간 일치 확인</summary>{data.report.interRater.length ? data.report.interRater.map((r, i) => <p key={i} className="mt-2">{criterionLabels[r.metricId] ?? r.metricId} · 비교 {r.compared}건 · 일치 {percent(r.rawAgreement)} · κ {r.kappa === null ? "계산 불가" : r.kappa.toFixed(3)}</p>) : <p className="mt-2">독립된 두 사람의 비교 가능한 판정이 부족합니다.</p>}</details>
    {data.experiments.map(experiment => <ExperimentResult key={experiment.id} report={experiment} busy={busy} onDecide={choice => onDecide(experiment.id, choice)} />)}
  </section>;
}

function ExperimentResult({ report, busy, onDecide }: { report: ExperimentReport; busy: boolean; onDecide: (choice: DecisionChoice) => void }) {
  const view = decisionView(report);
  return <article className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
    <h3 className="font-semibold">{view.title}</h3>
    <p className="text-sm">{view.regression}</p>
    <ul className="list-inside list-disc space-y-1 text-sm">{view.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <div className="rounded-lg bg-background p-3"><h4 className="text-sm font-semibold">개선 가설 · 효과는 추가 확인 필요</h4><ul className="mt-2 space-y-2 text-sm">{report.recipe.instructions.map(i => <li key={i.metricId}>{criterionLabels[i.metricId] ?? i.metricId}: {i.text}</li>)}</ul></div>
    <details className="text-sm"><summary className="cursor-pointer">점수 변화·선호·실행 조건</summary>
      {report.pointwise.map(p => <p key={`${p.partition}/${p.metricId}`} className="mt-2">{criterionLabels[p.metricId] ?? p.metricId} · {p.partition === "HOLDOUT" ? "새 사례" : "개선용 사례"} · 원문 {p.groups}개 · 점수 차이 {p.meanDelta === null ? "미측정" : p.meanDelta.toFixed(3)} · {p.interval ? `구간 ${p.interval.low.toFixed(3)}~${p.interval.high.toFixed(3)}` : "구간을 추정할 자료 부족"}</p>)}
      <p className="mt-2">독립 선호: 후보 {report.pairwise.candidate} · 기존 {report.pairwise.baseline} · 동률 {report.pairwise.tie} · 판단 어려움 {report.pairwise.uncertain}</p>
      <p className="mt-2 break-words text-xs text-muted-foreground">생성 {report.recipe.generatorModel} · 평가 {report.recipe.evaluatorModel} · 설정 {report.recipeHash.slice(0, 12)}</p>
    </details>
    {report.adoption ? <p role="status" className="text-sm font-medium">저장된 결정: {decisions[report.adoption.choice]}</p> : <div><p className="mb-2 text-xs text-muted-foreground">최종 결정은 저장 후 변경할 수 없습니다. 운영 설정과 원고는 자동으로 바뀌지 않습니다.</p><div className="flex flex-wrap gap-2">{(Object.keys(decisions) as DecisionChoice[]).map(choice => <button key={choice} type="button" className={buttonClass} disabled={busy || (choice === "SELECT_CANDIDATE" && !view.canSelect)} onClick={() => onDecide(choice)}>{decisions[choice]}</button>)}</div></div>}
  </article>;
}
