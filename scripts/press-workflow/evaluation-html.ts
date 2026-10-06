import type { EvaluationBundle } from "../../domain/press-workflow/evaluation/contracts";
import type { buildReport, reviewPacket } from "../../domain/press-workflow/evaluation/report";
import { insightsHtml } from "./quality-insights-html";

const escape = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const style = `:root{font-family:system-ui,sans-serif;color:#183333;background:#f3f6f4}body{margin:0}main{max-width:1120px;margin:auto;padding:36px 22px}h1{font-size:30px;letter-spacing:-.04em}h2{font-size:20px}p{line-height:1.7}.eyebrow{color:#476761;font-size:13px;letter-spacing:.12em}.notice{padding:16px;background:#fff5d7;border-left:4px solid #ac7929;border-radius:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}article,.panel{background:white;padding:22px;border:1px solid #d6e1dc;border-radius:12px;margin:18px 0}pre{font:inherit;white-space:pre-wrap;line-height:1.7;overflow-wrap:anywhere}.score{font-size:34px;font-weight:700}small{color:#4f6c65}label{display:block;margin:14px 0}select,input,textarea,button{font:inherit;padding:10px;border:1px solid #aabeb7;border-radius:6px;max-width:100%;box-sizing:border-box}textarea{width:100%;min-height:65px}button{background:#174f45;color:white;cursor:pointer}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #e0e8e4}details{margin-top:16px}summary{cursor:pointer}a{color:#176750}@media(max-width:700px){.grid{grid-template-columns:1fr}main{padding:18px 14px}h1{font-size:25px}}`;
const labels: Record<string, string> = { FACTUAL_SUPPORT: "사실 근거", REQUIRED_FACTS: "필수 정보 보존", STYLE_LEAKAGE: "예시 사실 오염", PROMOTIONAL_CLAIMS: "근거 없는 과장", REQUESTED_STYLE: "요청 문체" };
const shell = (title: string, body: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style></head><body><main>${body}</main></body></html>`;

function baseReportHtml(batch: EvaluationBundle, report: ReturnType<typeof buildReport>) {
  const metric = (n: number, d: number) => d ? `${n}/${d} (${(100 * n / d).toFixed(1)}%)` : "— · 비교할 표본 없음";
  const humanSection = `<article><h2>사람 검토로 평가기 확인</h2><p>검토 항목 ${report.review.labelledCount}/${report.review.eligibleCount} · 자동 판정과 비교 가능한 항목 ${report.review.comparableCount}개</p>
    <table><tbody><tr><th>요구사항 판정 일치</th><td>${metric(report.review.agreements, report.review.comparableCount)}</td></tr><tr><th>결함 재현율</th><td>${metric(report.review.detectedDefectCount, report.review.defectCount)}</td></tr><tr><th>오탐률 · 자동 판정 가능한 정상 항목</th><td>${metric(report.review.falsePositiveCount, report.review.negativeCount)}</td></tr><tr><th>Ragas 엄격 사실 근거 일치</th><td>${metric(report.review.faithfulnessAgreement, report.review.faithfulnessCompared)}</td></tr></tbody></table>
    <p>결함 재현율에는 자동 평가가 실패한 항목도 포함합니다. Ragas 일치는 점수 1.0 여부와 사람의 사실 근거 판정을 비교한 진단이며, 범용 합격 기준이 아닙니다.</p>
    ${report.disagreements.map(d => `<details><summary>${escape(labels[d.criterion])}: 사람 ${escape(d.human)} / 자동 ${escape(d.automatic)}</summary><p>${escape(d.reason)}</p><small>검토 ID ${d.reviewId.slice(0, 12)}</small></details>`).join("")}</article>`;
  const pairedSection = `<article><h2>같은 입력의 기본·변경 설정 비교</h2><p>점수 차이 하나로 개선을 확정하지 않습니다. 아래 차이는 변경 설정에서 기본 설정을 뺀 값입니다.</p><div style="overflow-x:auto"><table><thead><tr><th>사례 / 반복</th><th>분할</th><th>Ragas 차이</th><th>기본 요구사항</th><th>변경 요구사항</th></tr></thead><tbody>${report.paired.map(p => `<tr><td>${escape(p.caseKey)} / ${p.trial}</td><td>${escape(p.partition)}</td><td>${p.faithfulnessDelta === null ? "—" : p.faithfulnessDelta.toFixed(3)}</td><td>${escape(p.baselineVerdict ?? "미평가")}</td><td>${escape(p.candidateVerdict ?? "미평가")}</td></tr>`).join("")}</tbody></table></div></article>`;
  return shell("PressTuner 두 평가 비교", `<p class="eyebrow">PRESSTUNER · EVALUATION EVIDENCE</p><h1>같은 초안, 두 가지 평가</h1><p class="notice">${escape(report.summary.sourceKind)} · 초안 출처 ${escape(report.summary.draftSource)} · 사람 검토 ${escape(report.review.state)}<br>기성 평가와 도메인 요구사항은 서로 다른 기준입니다. 합성 결과는 모델 품질의 측정값이 아닙니다.</p><div class="grid"><article><h2>Ragas Faithfulness</h2><p>작성된 주장에 근거가 있는가</p><small>0~1 점수 · 필수 정보 누락이나 문체를 직접 평가하지 않습니다.</small></article><article><h2>PressTuner 요구사항</h2><p>사실과 요구사항을 함께 지켰는가</p><small>핵심 내용 실패 BLOCK · 문체 실패 WARN · 판단 불가 별도 표시</small></article></div><p>요청 ${report.summary.requestedCount}건 · 생성 ${report.summary.generatedCount}건 · 사람 라벨 ${report.review.labelledCount}/${report.review.eligibleCount} · 결론 ${escape(report.decision)}</p>${batch.evaluations.map(e => `<article><p class="eyebrow">${escape(e.draft.caseId)} · ${escape(e.draft.variant)} · ${e.draft.trial} · ${escape(e.draft.partition)}</p><h2>평가 대상 초안</h2><pre>${escape(e.draft.text)}</pre><div class="grid"><div class="panel"><h2>Ragas</h2><p class="score">${e.ragas.score === null ? "—" : e.ragas.score.toFixed(3)}</p><p>${escape(e.ragas.state)} ${escape(e.ragas.reasonCode ?? "")}</p></div><div class="panel"><h2>요구사항 평가</h2><p class="score">${escape(e.domain.verdict ?? "미평가")}</p><p>${escape(e.domain.state)}</p>${e.domain.checks.map(c => `<details><summary>${escape(labels[c.criterion])} · ${escape(c.judgment)}</summary><p>${escape(c.reason)}</p>${c.evidence.map(v => `<blockquote>${escape(v.quote)}<br><small>${escape(v.factIds.join(", "))}</small></blockquote>`).join("")}</details>`).join("")}</div></div><small>초안 SHA-256 ${e.draft.outputHash}<br>Judge ${escape(e.evaluator.judgeModel)} · Ragas ${escape(e.evaluator.ragasVersion)} · ${escape(e.evaluator.domainPolicy)}</small></article>`).join("")}${humanSection}${pairedSection}<article><h2>판정의 범위</h2><p>${escape(report.interpretation)}</p><p>비용: 미산정. 실제 사용량은 원본 실행 JSON에 기록합니다. 배포 승인: 없음.</p></article>`);
}

export function reportHtml(batch: EvaluationBundle, report: ReturnType<typeof buildReport>) {
  return baseReportHtml(batch, report).replace("<h1>같은 초안, 두 가지 평가</h1>", "<h1>AI 품질 분석과 개선 제안</h1>").replace('<div class="grid">', `${insightsHtml(report)}<div class="grid">`);
}

export function reviewHtml(packet: ReturnType<typeof reviewPacket>) {
  const data = JSON.stringify(packet).replace(/</g, "\\u003c");
  const hints: Record<string, string> = {
    FACTUAL_SUPPORT: "초안의 사실과 주장이 아래 근거로 뒷받침되나요?",
    REQUIRED_FACTS: "반드시 넣어야 하는 사실이 모두 들어 있나요?",
    STYLE_LEAKAGE: "표현 참고용 예시의 사실이나 수치를 가져오지 않았나요?",
    PROMOTIONAL_CLAIMS: "근거 없는 성능·성과·우수성 주장이 없나요?",
    REQUESTED_STYLE: "요청한 문체로 작성되었나요?",
  };
  const entries = packet.entries.map((entry, index) => `<article aria-labelledby="entry-${index}">
    <h2 id="entry-${index}">검토 ${index + 1}</h2>
    <h3>작성 요청</h3><p>${escape(entry.request)}</p>
    <h3>사실 근거</h3><ul>${entry.facts.map(f => `<li><strong>${escape(f.id)}</strong>: ${escape(f.content)}${entry.requiredFactIds.includes(f.id) ? " <strong>(필수)</strong>" : ""}</li>`).join("")}</ul>
    <p><strong>요청 문체:</strong> ${escape(entry.requestedStyle)}</p>
    <p><strong>표현 참고 — 사실 근거로 사용하면 안 됩니다:</strong> ${escape(entry.styleExamples)}</p>
    <h3>읽고 검토할 초안</h3><pre>${escape(entry.draft)}</pre>
    <h3>항목별 판정</h3><p>요구사항을 지켰으면 PASS, 위반했으면 FAIL, 판단하기 어려우면 UNCERTAIN을 선택하세요.</p>
    ${entry.labels.map((label, j) => `<div><label for="judgment-${index}-${j}">${escape(labels[label.criterion])} — ${escape(hints[label.criterion])}</label>
      <select id="judgment-${index}-${j}"><option value="">판정 선택</option><option value="PASS">PASS · 충족</option><option value="FAIL">FAIL · 위반</option><option value="UNCERTAIN">UNCERTAIN · 판단 어려움</option></select>
      <label for="reason-${index}-${j}">${escape(labels[label.criterion])} 판정 이유</label><textarea id="reason-${index}-${j}" placeholder="판정 이유와 확인한 문장을 짧게 써 주세요" maxlength="1000"></textarea></div>`).join("")}
  </article>`).join("");
  return shell("PressTuner 블라인드 검토", `<p class="eyebrow">PRESSTUNER · HUMAN REVIEW</p><h1>초안 검토</h1>
    <p class="notice">아래 초안 ${packet.entries.length}개를 읽고 항목별 판정과 이유를 입력해 주세요. 마지막에 이름을 입력하고 직접 검토 확인을 체크한 뒤 ‘검토 JSON 저장’을 누릅니다. 자동 평가 결과는 숨겨져 있습니다. 이 화면은 외부로 데이터를 보내지 않습니다.</p>
    <div id="entries">${entries}</div><article><h2>검토 파일 저장</h2>
    <label>검토자 이름 또는 식별자 <input id="reviewer" maxlength="100" autocomplete="name"></label>
    <label><input type="checkbox" id="attest"> 위 초안을 직접 읽고 라벨과 이유를 작성했습니다.</label>
    <button id="download">검토 JSON 저장</button><p>저장된 human-review.json 파일은 보통 다운로드 폴더에 있습니다. 저장 후 채팅에 알려 주세요.</p><p id="status" role="status"></p></article>
    <noscript><p class="notice">초안은 읽을 수 있지만 파일 저장에는 JavaScript가 필요합니다.</p></noscript>
    <script>
      const packet=${data};
      document.getElementById('download').onclick=()=>{
        const name=document.getElementById('reviewer').value.trim();
        const status=document.getElementById('status');
        if(!name||!document.getElementById('attest').checked){status.textContent='검토자와 직접 검토 확인이 필요합니다.';return;}
        packet.entries.forEach((entry,i)=>entry.labels.forEach((label,j)=>{
          label.judgment=document.getElementById('judgment-'+i+'-'+j).value||null;
          label.reason=document.getElementById('reason-'+i+'-'+j).value;
        }));
        if(packet.entries.some(e=>e.labels.some(l=>l.judgment&&!l.reason.trim()))){status.textContent='판정한 항목에는 이유를 작성해 주세요.';return;}
        packet.reviewer={type:'HUMAN',id:name,reviewedAt:new Date().toISOString(),attestation:'I reviewed the blinded outputs myself'};
        const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='human-review.json';a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        status.textContent='검토 JSON 다운로드를 요청했습니다. 미작성 항목은 미검토로 남습니다.';
      };
    </script>`);
}
