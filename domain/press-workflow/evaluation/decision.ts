import { CRITERIA, hash, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport, reviewSchema } from "./report";
import { evaluationReviewId } from "./analysis";

const rate = (n: number, d: number) => d ? n / d : null;

/** Reuse human labels only for exactly the same generation, never another model's rewritten output. */
export function rebindReview(dataset: Dataset, original: EvaluationBundle, reviewInput: unknown, target: EvaluationBundle) {
  buildReport(dataset, original, reviewInput);
  buildReport(dataset, target);
  if (hash(original.generation) !== hash(target.generation)) throw new Error("HUMAN_LABEL_GENERATION_MISMATCH");
  return reviewSchema.parse({ ...reviewSchema.parse(reviewInput), artifactHash: hash(target) });
}

export function auditJudges(dataset: Dataset, batch: EvaluationBundle, reviewInput?: unknown) {
  buildReport(dataset, batch, reviewInput);
  const review = reviewInput ? reviewSchema.parse(reviewInput) : null;
  return ([...CRITERIA.map(criterion => ({ evaluator: "DOMAIN" as const, criterion })), { evaluator: "RAGAS" as const, criterion: "FACTUAL_SUPPORT" as const }]).map(({ evaluator, criterion }) => {
    let truePositive = 0, falsePositive = 0, falseNegative = 0, trueNegative = 0, unavailable = 0, humanUncertain = 0, humanDefects = 0, unreviewed = 0;
    for (const e of batch.evaluations) {
      const human = review?.entries.find(r => r.reviewId === evaluationReviewId(e))?.labels.find(l => l.criterion === criterion)?.judgment;
      if (!human) { unreviewed++; continue; }
      if (human === "UNCERTAIN") { humanUncertain++; continue; }
      if (human === "FAIL") humanDefects++;
      const auto = evaluator === "DOMAIN" ? e.domain.checks.find(c => c.criterion === criterion)?.judgment
        : e.ragas.score === null ? undefined : e.ragas.score === 1 ? "PASS" : "FAIL";
      if (!auto || auto === "UNCERTAIN") { unavailable++; continue; }
      if (human === "FAIL") { if (auto === "FAIL") truePositive++; else falseNegative++; }
      else { if (auto === "FAIL") falsePositive++; else trueNegative++; }
    }
    const compared = truePositive + falsePositive + falseNegative + trueNegative;
    return { evaluator, criterion, scope: "REVIEWED_SAMPLE_ONLY" as const, interpretation: evaluator === "RAGAS" ? "STRICT_SUPPORT_SCORE_EQUALS_ONE" : "CRITERION_JUDGMENT",
      truePositive, falsePositive, falseNegative, trueNegative, unavailable, humanUncertain, humanDefects, unreviewed, compared,
      coverage: rate(compared, compared + unavailable), agreement: rate(truePositive + trueNegative, compared),
      conditionalDefectRecall: rate(truePositive, truePositive + falseNegative), endToEndDefectRecall: rate(truePositive, humanDefects),
      falsePositiveRate: rate(falsePositive, falsePositive + trueNegative) };
  });
}

export const criterionTitles: Record<typeof CRITERIA[number], string> = {
  FACTUAL_SUPPORT: "사실 근거", REQUIRED_FACTS: "필수 정보", STYLE_LEAKAGE: "참고 예시의 사실 혼입", PROMOTIONAL_CLAIMS: "근거 없는 과장", REQUESTED_STYLE: "요청 문체",
};

export function decisionAnalysis(dataset: Dataset, batch: EvaluationBundle, reviewInput?: unknown) {
  const report = buildReport(dataset, batch, reviewInput), review = reviewInput ? reviewSchema.parse(reviewInput) : null;
  const cards = batch.evaluations.map(e => {
    const reviewId = evaluationReviewId(e);
    const labels = review?.entries.find(r => r.reviewId === reviewId)?.labels;
    const findings = CRITERIA.flatMap(criterion => {
      const human = labels?.find(l => l.criterion === criterion), automatic = e.domain.checks.find(c => c.criterion === criterion);
      const judgment = human?.judgment ?? automatic?.judgment ?? "UNCERTAIN";
      if (judgment === "PASS") return [];
      return [{ criterion, judgment, source: human?.judgment ? "HUMAN" as const : "AUTOMATIC" as const,
        reason: human?.judgment ? human.reason : automatic?.reason ?? "판단에 사용할 평가 결과가 없습니다.",
        evidence: automatic?.evidence ?? [] }];
    });
    const failures = findings.filter(f => f.judgment === "FAIL"), important = failures.filter(f => f.criterion !== "REQUESTED_STYLE");
    const factualReview = labels?.find(l => l.criterion === "FACTUAL_SUPPORT")?.judgment;
    const unresolvedStandard = factualReview !== "PASS" && factualReview !== "FAIL" && (e.ragas.state !== "EVALUATED" || e.ragas.score !== 1);
    const state = important.length ? "FIX_REQUIRED" : findings.some(f => f.judgment === "UNCERTAIN") || unresolvedStandard ? "REVIEW_REQUIRED"
      : failures.length ? "STYLE_CHOICE" : "CHECKED";
    const copy = {
      FIX_REQUIRED: { title: "수정이 필요한 내용을 확인하세요", action: "근거와 문제 항목 확인", explanation: "사실·필수 정보 관련 지적이 있습니다. 자동 지적과 사람이 확인한 지적을 구분해 표시합니다." },
      REVIEW_REQUIRED: { title: "판단에 필요한 확인이 남았습니다", action: "필요한 항목만 검토", explanation: "평가 실패나 불확실성을 문제가 없다는 뜻으로 처리하지 않습니다." },
      STYLE_CHOICE: { title: "내용을 유지하며 문체를 선택하세요", action: "문체 요구와 초안 비교", explanation: "요청한 표현 방식에 대한 지적을 확인하세요." },
      CHECKED: { title: "검사한 항목에서 문제를 발견하지 못했습니다", action: "초안과 검사 범위 확인", explanation: "자동 검사 결과입니다. 실제 사실의 진실성이나 게시 승인을 보장하지 않습니다." },
    }[state];
    if (state === "REVIEW_REQUIRED" && unresolvedStandard && e.domain.state === "EVALUATED" && e.ragas.state === "EVALUATED") {
      copy.explanation = "업무 기준은 판정했지만 근거 일치 지표와 확인 결과가 다릅니다. 초안의 사실을 채택한 근거와 대조해 주세요.";
    }
    return { reviewId, caseId: e.draft.caseId, variant: e.draft.variant, state, ...copy, findings,
      standard: e.ragas, business: e.domain, evaluator: e.evaluator };
  });
  return { version: "press-quality-decisions/v1", artifactHash: hash(batch), cards, judgeAudit: auditJudges(dataset, batch, reviewInput),
    failureGroups: CRITERIA.map(criterion => ({ criterion, title: criterionTitles[criterion], count: cards.filter(c => c.findings.some(f => f.criterion === criterion && f.judgment === "FAIL")).length })),
    generationFailures: batch.generation.attempts.filter(a => !a.draft).length,
    evaluationFailures: batch.evaluations.filter(e => e.domain.state !== "EVALUATED" || e.ragas.state !== "EVALUATED").length,
    recommendations: report.insights.recommendations, comparison: report.insights.paired,
    deploymentAuthorized: false as const };
}
