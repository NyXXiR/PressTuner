import { compareExperiment } from "../../domain/press-workflow/evaluation/experiment";
import { criterionTitles } from "../../domain/press-workflow/evaluation/decision";
import type { Dataset, EvaluationBundle } from "../../domain/press-workflow/evaluation/contracts";
import type { ReviewSession } from "../../domain/press-workflow/evaluation/quick-review";
import { esc, qualityCss } from "./quick-review-html";

export function experimentHtml(dataset: Dataset, batch: EvaluationBundle, session: ReviewSession, token: string) {
  const result = compareExperiment(dataset, batch), recipe = batch.generation.experimentRecipe;
  const choiceTitles = { KEEP_BASELINE: "기존 설정 유지", CANDIDATE_FOR_TEST: "후보로 추가 검증", HOLD: "판단 보류" };
  const reasonTitles: Record<string, string> = {
    MISSING_FROZEN_RECIPE: "비교할 개선 설정을 아직 고정하지 않았습니다.", NO_INDEPENDENT_HOLDOUT: "개선안 작성에 쓰지 않은 원문으로 비교해야 합니다.",
    NOT_LIVE_GENERATION: "실제 모델로 새로 생성하고 평가한 비교 결과가 필요합니다.", RECIPE_OR_PARTITION_MISMATCH: "생성 설정이나 검증 자료의 출처가 실험 조건과 일치하지 않습니다.",
    INCOMPLETE_EVALUATION: "일부 원문의 평가가 끝나지 않아 비교에서 빠졌습니다.", OBSERVED_REGRESSION: "후보 설정에서 악화된 업무 기준이 있습니다.",
    INSUFFICIENT_EFFECT_EVIDENCE: "개선 효과를 판단할 원문 수나 통계적 근거가 부족합니다.", INDEPENDENT_JUDGE_AUDIT_REQUIRED: "별도의 사람 검토 자료로 평가기 자체의 오류를 확인해야 합니다.",
    TOO_FEW_AUDIT_GROUPS: "평가기 검증에 사용한 원문 수가 부족합니다.", INCOMPLETE_AUDIT_LABELS: "평가기 검증 표본에 사람 판정이 빠져 있습니다.",
    INSUFFICIENT_AUDIT_COVERAGE: "평가기 검증에 비교 가능한 판정이 충분하지 않습니다.", INSUFFICIENT_AUDIT_CLASS_GROUPS: "정상 사례와 결함 사례가 여러 원문에 걸쳐 필요합니다.",
    AUDIT_ERRORS_EXCEED_POLICY: "평가기의 오탐·미탐이 실험 기준을 넘었습니다.",
  };
  const recommendation = result.state === "REGRESSION" ? "현재 권고: 후보 채택을 보류하고 악화된 항목을 확인하세요." : result.state === "READY_FOR_OPERATOR" ? "비교 기준을 충족했습니다. 근거를 확인하고 다음 실험 방향을 선택하세요." : "현재 권고: 근거 부족으로 보류. 표본과 평가기 검증 상태를 확인하세요.";
  const state = JSON.stringify({ token, sessionId: session.sessionId, revision: session.revision }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>개선안 선택 · PressTuner</title><style>${qualityCss}</style></head><body><main><p class="tag">PRESSTUNER / IMPROVEMENT</p><h1>설정을 바꾸기 전에 효과를 확인하세요</h1><p><a href="/decisions">품질 판단으로 돌아가기</a></p>
  <section class="card"><h2>${result.state === "REGRESSION" ? "악화된 항목이 있습니다" : "채택 판단을 위한 근거를 확인하세요"}</h2><p>${recommendation}</p><ul>${result.reasons.map(r => `<li>${esc(reasonTitles[r] ?? r)}</li>`).join("")}</ul><div class="table-wrap"><table><thead><tr><th>업무 기준</th><th>비교 원문</th><th>개선 / 악화 원문</th><th>평가 불가</th></tr></thead><tbody>${result.comparisons.map(c => `<tr><td>${esc(criterionTitles[c.criterion])}</td><td>${c.measuredGroups}/${c.groupCount}</td><td>${c.improvements} / ${c.regressions}</td><td>${c.unknownGroups}</td></tr>`).join("")}</tbody></table></div><p class="muted">같은 원문의 반복을 독립 표본으로 세지 않습니다. 평가기 정확도 개선과 초안 품질 개선은 다른 결과입니다.</p></section>
  <section class="card"><h2>후보에서 바꾼 내용</h2>${recipe ? `<ul>${recipe.instructions.map(i => `<li>${esc(i.text)}</li>`).join("")}</ul>` : "<p>아직 고정된 개선 실험이 없습니다. 실패 분석에서 후보를 만든 뒤 비교하세요.</p>"}<h3>내 결정</h3><p>운영 적용 없이 다음 실험 방향을 저장합니다.</p><div class="actions"><button data-choice="KEEP_BASELINE">기존 설정 유지</button><button data-choice="CANDIDATE_FOR_TEST" ${recipe ? "" : "disabled"}>후보로 추가 검증</button><button data-choice="HOLD">판단 보류</button></div><p id="status" role="status">${session.experimentDecisions?.length ? `저장된 결정: ${esc(choiceTitles[session.experimentDecisions.at(-1)!.choice])}` : "아직 선택하지 않았습니다."}</p></section>
  <details class="card"><summary>실험 조건·비용·판단 보류 이유</summary><ul>${result.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul><p>토큰과 생성 지연은 상세 보고서에서 확인할 수 있습니다. 가격표를 적용하지 않아 금액 효과는 산정하지 않았습니다.</p><a href="/report">상세 보고서</a></details></main><script>
  const state=${state};let busy=false;document.querySelectorAll('button[data-choice]').forEach(b=>b.onclick=async()=>{if(busy)return;busy=true;try{const response=await fetch('/experiment-choice',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Token':state.token},body:JSON.stringify({sessionId:state.sessionId,revision:state.revision,choice:b.dataset.choice})});if(!response.ok)throw new Error(response.status===409?'화면을 새로고침하고 다시 선택하세요.':'저장하지 못했습니다. 다시 선택하세요.');const saved=await response.json();state.revision=saved.revision;document.getElementById('status').textContent='저장됨 · '+b.textContent+' · 운영 설정은 바뀌지 않습니다.';}catch(e){document.getElementById('status').textContent=e.message;}finally{busy=false;}});
  </script></body></html>`;
}
