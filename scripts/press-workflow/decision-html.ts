import { decisionAnalysis, criterionTitles } from "../../domain/press-workflow/evaluation/decision";
import type { Dataset, EvaluationBundle } from "../../domain/press-workflow/evaluation/contracts";
import type { ReviewSession } from "../../domain/press-workflow/evaluation/quick-review";
import { recommendationCopy, evaluationReviewId } from "../../domain/press-workflow/evaluation/analysis";
import { esc, qualityCss } from "./quick-review-html";

export function decisionHtml(dataset: Dataset, batch: EvaluationBundle, session: ReviewSession) {
  const a = decisionAnalysis(dataset, batch, session.packet);
  const number = (v: number | null) => v === null ? "판단 자료 없음" : v.toFixed(2);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>품질 판단 · PressTuner</title><style>${qualityCss}</style></head><body><main>
  <p class="tag">PRESSTUNER / QUALITY DECISIONS</p><h1>확인할 문제와 다음 선택</h1><p>근거를 확인하고 개선 방향을 선택하세요. 자동 평가와 사람이 확인한 내용을 구분했습니다.</p>
  <p class="note">${batch.evaluations.every(e => e.evaluationMode === "LIVE") ? "실제 모델 평가 · 통제된 테스트 자료" : "합성 또는 모의 평가 · 모델 품질의 실측 결과가 아닙니다."} · 검토 표본의 판단을 전체 품질로 일반화하지 않습니다.</p>
  <div class="metrics"><div class="card"><strong>${a.cards.filter(c => c.state === "FIX_REQUIRED").length}</strong><p>수정 확인이 필요한 초안</p></div><div class="card"><strong>${a.cards.filter(c => c.state === "REVIEW_REQUIRED").length}</strong><p>판단 자료가 부족한 초안</p></div><div class="card"><strong>${session.events.length}</strong><p>저장된 선택 · 변경/건너뛰기 포함</p></div></div>
  <div class="actions"><a class="button primary" href="/">필요한 항목만 검토</a><a class="button" href="/report">통계와 실험 상세</a></div>
  ${a.generationFailures ? `<p class="note">생성하지 못한 요청 ${a.generationFailures}건도 결과에 포함합니다.</p>` : ""}
  ${a.cards.map(c => { const e = batch.evaluations.find(e => evaluationReviewId(e) === c.reviewId)!;
    return `<article><p class="tag">${esc(c.caseId)} · ${c.variant === "BASELINE" ? "기존 설정" : "변경 설정"}</p><h2>${esc(c.title)}</h2><p>${esc(c.explanation)}</p>
    ${c.findings.filter(f => f.judgment !== "UNCERTAIN").map(f => `<section><h3>${esc(criterionTitles[f.criterion])} <small>${f.source === "HUMAN" ? "사람 확인" : "자동 판단 · 미확인"}</small></h3><p>${esc(f.reason)}</p>${f.evidence.map(v => `<blockquote>${esc(v.quote)}<br><small>자동 평가가 인용한 부분</small></blockquote>`).join("")}</section>`).join("")}
    ${c.findings.some(f => f.judgment === "UNCERTAIN") ? `<details><summary>판단이 남은 ${c.findings.filter(f => f.judgment === "UNCERTAIN").length}개 항목</summary>${c.findings.filter(f => f.judgment === "UNCERTAIN").map(f => `<p>${esc(criterionTitles[f.criterion])} · ${f.source === "HUMAN" ? "사람도 판단 어려움" : "자동 판정 불가"}: ${esc(f.reason)}</p>`).join("")}</details>` : ""}
    <details><summary>${esc(c.action)}</summary><div class="grid"><section><h3>채택한 사실</h3><ul>${dataset.cases.find(s => s.caseId === c.caseId)!.facts.map(f => `<li>${esc(f.content)}</li>`).join("")}</ul></section><section><h3>초안</h3><pre>${esc(e.draft.text)}</pre></section></div></details>
    <details><summary>두 평가 관점과 기술 근거</summary><div class="grid"><section><h3>표준 지표 · Ragas</h3><p>작성한 주장의 근거 일치 ${number(c.standard.score)}</p><small>필수 정보 누락은 이 점수로 판단하지 않습니다.</small></section><section><h3>업무 기준 · ${c.evaluator.domainFramework ? "DeepEval G-Eval" : "기존 자체 평가기"}</h3><ul>${c.business.checks.map(x => `<li>${esc(criterionTitles[x.criterion])}: ${esc(x.judgment)}${x.score === undefined ? "" : ` (${number(x.score)})`}</li>`).join("")}</ul></section></div><p class="muted">모델 ${esc(c.evaluator.judgeModel)} · Ragas ${esc(c.evaluator.ragasVersion)} · ${esc(c.evaluator.domainFramework?.version ?? "custom/v1")}</p></details></article>`;
  }).join("")}
  <section class="card"><h2>실패에서 개선 실험으로</h2>${a.recommendations.map(r => `<h3>${esc(recommendationCopy[r.code].title)}</h3><p>${esc(recommendationCopy[r.code].action)}</p><p class="muted">검증: ${esc(recommendationCopy[r.code].validation)}</p>`).join("") || "<p>현재 관측에서 제안할 변경이 없습니다.</p>"}<p class="note">제안의 효과는 별도 실행으로 확인합니다. 개선 설정의 실행·비교 결과를 확인한 뒤 채택하세요.</p><a href="/experiment">개선 설정 비교와 선택</a></section>
  <details class="card"><summary>평가기 자체는 얼마나 믿을 수 있나요?</summary><p>검토한 표본 내 결과입니다. 독립 감사 인증이나 전체 고객 정확도가 아닙니다. 평가 불가로 놓친 결함도 전체 결함 탐지율에 포함합니다.</p><div class="table-wrap"><table><thead><tr><th>평가 / 기준</th><th>탐지 / 사람 결함</th><th>오탐</th><th>미탐</th><th>평가 불가</th></tr></thead><tbody>${a.judgeAudit.map(r => `<tr><td>${esc(r.evaluator)} / ${esc(criterionTitles[r.criterion])}</td><td>${r.truePositive} / ${r.humanDefects}</td><td>${r.falsePositive}</td><td>${r.falseNegative}</td><td>${r.unavailable}</td></tr>`).join("")}</tbody></table></div></details>
  <p class="muted">이 화면은 로컬 실험 기록입니다. 게시나 운영 설정 변경을 실행하지 않습니다.</p></main></body></html>`;
}
