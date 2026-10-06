import { CRITERIA, hash, type Dataset, type EvaluationBundle } from "./contracts";

export type Interval = { low: number; high: number };
export function wilson(events: number, total: number): Interval | null {
  if (!Number.isInteger(events) || !Number.isInteger(total) || events < 0 || total < events) throw new Error("INVALID_DENOMINATOR");
  if (!total) return null;
  const z = 1.959963984540054, p = events / total, d = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / d;
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
const average = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export function pairedInterval(deltas: number[]) {
  const meanDelta = average(deltas);
  if (deltas.length < 10) return { meanDelta, interval: null, state: "INSUFFICIENT_GROUPS" as const };
  if (Math.max(...deltas) - Math.min(...deltas) < 1e-12) return { meanDelta, interval: null, state: "DEGENERATE" as const };
  let seed = 73619;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const estimates = Array.from({ length: 4000 }, () => average(deltas.map(() => deltas[Math.floor(random() * deltas.length)]))!).sort((a, b) => a - b);
  return { meanDelta, interval: { low: estimates[99], high: estimates[3899] }, state: "EXPLORATORY" as const };
}
export const recommendationCopy = {
  REPAIR_EVALUATOR: { title: "평가기 응답 형식과 근거 인용을 보완하세요", action: "실패한 응답의 JSON 구조·인용 구간·fact ID를 분리 진단하고 구조화된 출력 계약을 적용하세요.", validation: "새 개발 사례에서 판단 불가 비율과 사람 대비 결함 탐지율을 함께 측정하세요. 형식 성공만으로 정확도를 인정하지 않습니다." },
  CALIBRATE_RUBRIC: { title: "사람과 다른 판정을 보정하세요", action: "불일치 사례를 기준별로 분류하고 사실 주장·홍보 표현의 경계를 명시하세요. 기존 사람 판정을 자동으로 바꾸지 마세요.", validation: "보정에 사용하지 않은 사례를 블라인드 검토하여 일치율, 놓친 결함과 오탐을 확인하세요." },
  GROUND_CLAIMS: { title: "근거 없는 주장과 홍보 표현을 줄이세요", action: "생성 지침 후보: 제공된 사실에 없는 기능, 향후 계획, 시장 평가, 가격의 합리성, 성과는 쓰지 않는다. 뒷받침할 사실이 없으면 해당 문장을 생략한다.", validation: "별도 입력에서 기존·변경 설정의 사실 근거/과장 위반을 비교하세요. 필수 정보와 문체가 나빠지지 않았는지도 점검하세요." },
  PRESERVE_REQUIRED_FACTS: { title: "필수 사실을 초안과 대조하세요", action: "생성 전 필수 fact 목록을 만들고 작성 후 각 사실이 의미를 유지해 포함됐는지 대조하도록 지침을 추가하세요.", validation: "누락·동의 표현·수치 변경 사례에서 필수 정보 충족률과 오탐을 함께 비교하세요." },
  ISOLATE_STYLE: { title: "표현 예시의 사실 유입을 차단하세요", action: "표현 예시는 문체만 참고하고 이름·수치·성과는 채택된 사실에서만 가져오도록 지침을 강화하세요.", validation: "새로운 표현 예시를 사용한 독립 사례에서 사실 유입과 문체 충족을 함께 비교하세요." },
  ALIGN_STYLE: { title: "요청 문체를 구체화하세요", action: "문장 길이, 존댓말, 전문 용어 설명 등 관찰 가능한 문체 기준을 생성 지침에 명시하세요.", validation: "사실과 필수 정보가 유지되는 상태에서 블라인드 문체 선택 결과를 비교하세요." },
  COLLECT_INDEPENDENT_CASES: { title: "독립 사례를 더 확보하세요", action: "서로 다른 사용 맥락의 입력을 추가하고 개발 사례와 보정에 쓰지 않을 평가 사례를 미리 나누세요.", validation: "원문 그룹 수, 완전한 비교 쌍, 구간 폭과 누락률을 확인하세요. 현재 합성 사례를 전체 고객 품질로 일반화하지 않습니다." },
  REPAIR_GENERATION: { title: "생성 실패를 먼저 확인하세요", action: "실패한 생성의 입력·응답 계약과 실행 제한을 점검하세요. 실패를 제외한 점수만으로 변경안을 고르지 마세요.", validation: "동일한 요청 수를 분모로 생성 성공률과 평가 품질을 함께 재측정하세요." },
} as const;
export type RecommendationCode = keyof typeof recommendationCopy;
export type HumanObservation = { reviewId: string; criterion: string; judgment: string };
export const evaluationReviewId = (e: EvaluationBundle["evaluations"][number]) => hash({ input: e.draft.inputHash, output: e.draft.outputHash, variant: e.draft.variant, trial: e.draft.trial });

/** Conditional benchmark diagnostics. No population claim or automatic adoption. */
export function analyseQuality(batch: EvaluationBundle, human: HumanObservation[], dataset?: Dataset) {
  const metadata = (caseId: string) => dataset?.cases.find(c => c.caseId === caseId) ?? batch.evaluations.find(e => e.draft.caseId === caseId)?.draft;
  const rates = (["DEVELOPMENT", "HOLDOUT"] as const).flatMap(partition => (["BASELINE", "CANDIDATE"] as const).flatMap(variant => {
    const rows = batch.evaluations.filter(e => e.draft.partition === partition && e.draft.variant === variant);
    const attempts = batch.generation.attempts.filter(a => a.variant === variant && metadata(a.caseId)?.partition === partition);
    const groups = [...new Set(attempts.map(a => metadata(a.caseId)!.groupId))];
    return CRITERIA.map(criterion => {
      let evaluatedGroups = 0, affectedGroups = 0;
      for (const group of groups) {
        const members = rows.filter(e => e.draft.groupId === group);
        const expected = attempts.filter(a => metadata(a.caseId)?.groupId === group);
        const judgments = members.map(e => e.domain.checks.find(c => c.criterion === criterion)?.judgment);
        if (!members.length || members.length !== expected.length || judgments.some(j => j !== "PASS" && j !== "FAIL")) continue;
        evaluatedGroups++;
        if (judgments.includes("FAIL")) affectedGroups++;
      }
      return { partition, variant, criterion, groupCount: groups.length, evaluatedGroups, affectedGroups, unknownGroups: groups.length - evaluatedGroups,
        interval: wilson(affectedGroups, evaluatedGroups) };
    });
  }));
  const paired = (["DEVELOPMENT", "HOLDOUT"] as const).map(partition => {
    const rows = batch.evaluations.filter(e => e.draft.partition === partition);
    const attempts = batch.generation.attempts.filter(a => metadata(a.caseId)?.partition === partition);
    const groups = [...new Set(attempts.map(a => metadata(a.caseId)!.groupId))];
    const deltas: number[] = [];
    let pairCount = 0;
    for (const group of groups) {
      const members = rows.filter(e => e.draft.groupId === group);
      const trials = [...new Set(attempts.filter(a => metadata(a.caseId)?.groupId === group).map(a => a.trial))];
      const values = trials.flatMap(trial => {
        const a = members.find(e => e.draft.trial === trial && e.draft.variant === "BASELINE"), b = members.find(e => e.draft.trial === trial && e.draft.variant === "CANDIDATE");
        return a && b && a.ragas.score !== null && b.ragas.score !== null && a.draft.model === b.draft.model && a.draft.inputHash === b.draft.inputHash
          && hash(a.evaluator) === hash(b.evaluator) && a.evaluationMode === b.evaluationMode ? [b.ragas.score - a.ragas.score] : [];
      });
      if (!values.length || values.length !== trials.length) continue;
      deltas.push(average(values)!); pairCount += values.length;
    }
    return { partition, groupCount: groups.length, completeGroups: deltas.length, excludedGroups: groups.length - deltas.length, pairCount, ...pairedInterval(deltas) };
  });
  const recommendations: { code: RecommendationCode; count: number; confidence: "DIAGNOSTIC" | "AUTOMATIC_FLAG" | "HUMAN_CONFIRMED"; caseKeys: string[] }[] = [];
  const add = (code: RecommendationCode, rows: EvaluationBundle["evaluations"], confidence: typeof recommendations[number]["confidence"]) => {
    if (rows.length) recommendations.push({ code, count: rows.length, confidence, caseKeys: [...new Set(rows.map(e => e.draft.caseId))].sort() });
  };
  add("REPAIR_EVALUATOR", batch.evaluations.filter(e => e.domain.state !== "EVALUATED" || e.ragas.state !== "EVALUATED"), "DIAGNOSTIC");
  add("CALIBRATE_RUBRIC", batch.evaluations.filter(e => human.some(h => h.reviewId === evaluationReviewId(e) && h.judgment !== "UNCERTAIN" && h.judgment !== e.domain.checks.find(c => c.criterion === h.criterion)?.judgment)), "DIAGNOSTIC");
  for (const [code, criteria] of [["GROUND_CLAIMS", ["FACTUAL_SUPPORT", "PROMOTIONAL_CLAIMS"]], ["PRESERVE_REQUIRED_FACTS", ["REQUIRED_FACTS"]], ["ISOLATE_STYLE", ["STYLE_LEAKAGE"]], ["ALIGN_STYLE", ["REQUESTED_STYLE"]]] as const) {
    const observed = batch.evaluations.filter(e => criteria.some(c => {
      const h = human.find(h => h.reviewId === evaluationReviewId(e) && h.criterion === c);
      return h ? h.judgment === "FAIL" : e.domain.checks.some(j => j.criterion === c && j.judgment === "FAIL");
    }));
    const confirmed = observed.filter(e => human.some(h => h.reviewId === evaluationReviewId(e) && (criteria as readonly string[]).includes(h.criterion) && h.judgment === "FAIL"));
    add(code, confirmed, "HUMAN_CONFIRMED");
    add(code, observed.filter(e => !confirmed.includes(e)), "AUTOMATIC_FLAG");
  }
  if (paired.every(p => p.state !== "EXPLORATORY")) recommendations.push({ code: "COLLECT_INDEPENDENT_CASES", count: paired.reduce((n, p) => n + p.groupCount, 0), confidence: "DIAGNOSTIC", caseKeys: [] });
  const failed = batch.generation.attempts.filter(a => !a.draft);
  if (failed.length) recommendations.push({ code: "REPAIR_GENERATION", count: failed.length, confidence: "DIAGNOSTIC", caseKeys: [...new Set(failed.map(a => a.caseId))].sort() });
  return { version: "quality-insights/v1" as const, intervalLevel: .95 as const, intervalMethod: "WILSON_GROUP_FLAG" as const,
    pairedMethod: "GROUP_PAIRED_PERCENTILE_BOOTSTRAP" as const, bootstrapResamples: 4000 as const, minimumPairedGroups: 10 as const,
    scope: "CONDITIONAL_BENCHMARK" as const, humanScope: "REVIEWED_SAMPLE_ONLY" as const, rates, paired, recommendations };
}
