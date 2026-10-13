import { z } from "zod";
import { criterionSchema, digest, hash, scenarioInputHash, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport, reviewSchema } from "./report";
import { evaluationReviewId, recommendationCopy } from "./analysis";

export const regressionSchema = z.object({ version: z.literal("press-quality-regression/v1"), datasetHash: digest, evaluatorHash: digest,
  sourceArtifactHash: digest, sourceReviewHash: digest,
  requirements: z.array(z.object({ caseId: z.string(), inputHash: digest, criterion: criterionSchema, expected: z.literal("PASS"),
    sources: z.array(z.object({ reviewId: digest, outputHash: digest }).strict()).min(1) }).strict()).min(1).max(500),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.requirements.map(x => `${x.caseId}/${x.criterion}`)).size !== r.requirements.length) ctx.addIssue({ code: "custom", message: "Duplicate regression requirement" });
});

export function promoteRegression(dataset: Dataset, batch: EvaluationBundle, reviewInput: unknown) {
  if (!reviewInput) throw new Error("HUMAN_FAILURE_REQUIRED");
  buildReport(dataset, batch, reviewInput);
  const review = reviewSchema.parse(reviewInput);
  const requirements: z.infer<typeof regressionSchema>["requirements"] = [];
  for (const e of batch.evaluations) {
    if (e.draft.partition !== "DEVELOPMENT") continue;
    const entry = review.entries.find(r => r.reviewId === evaluationReviewId(e))!;
    for (const label of entry.labels.filter(l => l.judgment === "FAIL")) {
      const source = { reviewId: entry.reviewId, outputHash: entry.outputHash };
      const existing = requirements.find(r => r.caseId === e.draft.caseId && r.criterion === label.criterion);
      if (existing) existing.sources.push(source);
      else requirements.push({ caseId: e.draft.caseId, inputHash: e.draft.inputHash, criterion: label.criterion, expected: "PASS", sources: [source] });
    }
  }
  if (!requirements.length) throw new Error("HUMAN_FAILURE_REQUIRED");
  return regressionSchema.parse({ version: "press-quality-regression/v1", datasetHash: hash(dataset), evaluatorHash: hash(batch.evaluations[0].evaluator),
    sourceArtifactHash: hash(batch), sourceReviewHash: hash(review), requirements });
}

export function regressionGate(dataset: Dataset, manifestInput: unknown, batch: EvaluationBundle) {
  buildReport(dataset, batch);
  const manifest = regressionSchema.parse(manifestInput);
  if (manifest.datasetHash !== hash(dataset)) throw new Error("REGRESSION_DATASET_MISMATCH");
  if (batch.evaluations.some(e => hash(e.evaluator) !== manifest.evaluatorHash)) throw new Error("REGRESSION_EVALUATOR_MISMATCH");
  const results = manifest.requirements.map(r => {
    const scenario = dataset.cases.find(c => c.caseId === r.caseId);
    if (!scenario || scenarioInputHash(scenario) !== r.inputHash) throw new Error("REGRESSION_INPUT_MISMATCH");
    const attempts = batch.generation.attempts.filter(a => a.caseId === r.caseId && a.variant === "CANDIDATE");
    const rows = batch.evaluations.filter(e => e.draft.caseId === r.caseId && e.draft.variant === "CANDIDATE");
    const judgments = rows.map(e => e.domain.checks.find(c => c.criterion === r.criterion)?.judgment);
    const state = judgments.includes("FAIL") ? "REGRESSION" : !attempts.length || rows.length !== attempts.length || judgments.some(j => j !== "PASS") ? "UNKNOWN" : "PASS";
    return { caseId: r.caseId, criterion: r.criterion, state, observed: judgments.length, requested: attempts.length };
  });
  const exitCode = results.some(r => r.state === "REGRESSION") ? 1 : results.some(r => r.state === "UNKNOWN") ? 2 : 0;
  return { version: "press-quality-regression-result/v1", manifestHash: hash(manifest), artifactHash: hash(batch), exitCode,
    state: exitCode === 1 ? "REGRESSION" : exitCode === 2 ? "INCOMPLETE" : "PASS", results,
    evidence: batch.evaluations.every(e => e.evaluationMode === "LIVE" && e.draft.evidenceClass === "MEASURED_TEST") && batch.generation.kind === "GENERATION" ? "MEASURED_TEST" : "OFFLINE_OR_AUTHORED",
    deploymentAuthorized: false as const };
}

const instructions = {
  FACTUAL_SUPPORT: "채택된 사실로 뒷받침되는 주장만 작성하세요. 수치·날짜·단위·발언 주체를 보존하세요.",
  REQUIRED_FACTS: "제공된 필수 사실 목록의 의미를 빠짐없이 초안에 포함하세요. 작성 후 항목별 누락을 확인하세요.",
  STYLE_LEAKAGE: "표현 예시는 문체만 참고하세요. 그 안의 이름·수치·실적을 현재 문서의 사실로 사용하지 마세요.",
  PROMOTIONAL_CLAIMS: "제공된 사실에 없는 성과·우수성·시장 평가·향후 계획은 만들지 마세요. 근거 없는 홍보 문장을 생략하세요.",
  REQUESTED_STYLE: "요청 문체를 지키되 사실의 의미와 필수 정보를 유지하세요.",
} as const;

export function improvementPlan(dataset: Dataset, batch: EvaluationBundle, reviewInput?: unknown) {
  const report = buildReport(dataset, batch, reviewInput);
  if (batch.evaluations.some(e => e.draft.partition !== "DEVELOPMENT")) throw new Error("HOLDOUT_CANNOT_TUNE_IMPROVEMENT");
  const review = reviewInput ? reviewSchema.parse(reviewInput) : null;
  const criteria = new Set<keyof typeof instructions>();
  for (const e of batch.evaluations) for (const criterion of Object.keys(instructions) as (keyof typeof instructions)[]) {
    const human = review?.entries.find(r => r.reviewId === evaluationReviewId(e))?.labels.find(l => l.criterion === criterion)?.judgment;
    const auto = e.domain.checks.find(c => c.criterion === criterion)?.judgment;
    if ((human ?? auto) === "FAIL") criteria.add(criterion);
  }
  return { version: "press-quality-improvement/v1" as const, sourceArtifactHash: hash(batch), datasetHash: hash(dataset),
    evaluatorHash: batch.evaluations[0] ? hash(batch.evaluations[0].evaluator) : null,
    instructions: [...criteria].sort().map(criterion => ({ criterion, text: instructions[criterion] })),
    diagnostics: report.insights.recommendations.map(r => ({ code: r.code, count: r.count, confidence: r.confidence, validation: recommendationCopy[r.code].validation })),
    effect: "NOT_MEASURED" as const, adoption: "PENDING" as const };
}
