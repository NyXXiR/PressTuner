import { z } from "zod";
import { analyseQuality, type HumanObservation } from "./analysis";
import { CRITERIA, POLICY_VERSION, RAGAS_VERSION, criterionSchema, datasetSchema, digest, evaluationBundleSchema, hash,
  judgmentValueSchema, scenarioInputHash, type Dataset, type Evaluation, type EvaluationBundle } from "./contracts";

export const reviewSchema = z.object({ version: z.literal("press-eval-human-review/v1"), datasetHash: digest, artifactHash: digest,
  reviewer: z.object({ type: z.literal("HUMAN"), id: z.string().trim().min(1).max(100), reviewedAt: z.string().datetime(),
    attestation: z.literal("I reviewed the blinded outputs myself") }).strict().nullable(),
  entries: z.array(z.object({ reviewId: digest, outputHash: digest, request: z.string(), facts: z.array(z.object({ id: z.string(), content: z.string() }).strict()),
    requiredFactIds: z.array(z.string()), requestedStyle: z.string(), styleExamples: z.string(), draft: z.string(),
    labels: z.array(z.object({ criterion: criterionSchema, judgment: judgmentValueSchema.nullable(), reason: z.string().max(1000) }).strict()).length(5),
  }).strict()).max(600),
}).strict();
const reviewId = (e: Evaluation) => hash({ input: e.draft.inputHash, output: e.draft.outputHash, variant: e.draft.variant, trial: e.draft.trial });
function validated(datasetInput: Dataset, batchInput: EvaluationBundle) {
  const dataset = datasetSchema.parse(datasetInput), batch = evaluationBundleSchema.parse(batchInput);
  if (batch.generation.datasetHash !== hash(dataset) || batch.evaluations.some(e => {
    const c = dataset.cases.find(c => c.caseId === e.draft.caseId);
    return !c || e.draft.inputHash !== scenarioInputHash(c) || e.contextHash !== hash(c.facts);
  })) throw new Error("REPORT_IDENTITY_MISMATCH");
  return { dataset, batch };
}
export function reviewPacket(datasetInput: Dataset, batchInput: EvaluationBundle) {
  const { dataset, batch } = validated(datasetInput, batchInput);
  return { version: "press-eval-human-review/v1" as const, datasetHash: hash(dataset), artifactHash: hash(batch), reviewer: null,
    entries: batch.evaluations.map(e => {
      const c = dataset.cases.find(c => c.caseId === e.draft.caseId)!;
      return { reviewId: reviewId(e), outputHash: e.draft.outputHash, request: c.request, facts: c.facts, requiredFactIds: c.requiredFactIds,
        requestedStyle: c.requestedStyle, styleExamples: c.styleExamples, draft: e.draft.text,
        labels: CRITERIA.map(criterion => ({ criterion, judgment: null, reason: "" })) };
    }).sort((a, b) => a.reviewId.localeCompare(b.reviewId)) };
}
const ratio = (n: number, d: number) => d ? n / d : null;
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const p95 = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] : null;

export function buildReport(datasetInput: Dataset, batchInput: EvaluationBundle, reviewInput?: unknown) {
  const { dataset, batch } = validated(datasetInput, batchInput), packet = reviewPacket(dataset, batch);
  let labelledCount = 0, comparableCount = 0, agreements = 0, defectCount = 0, detectedDefectCount = 0, negativeCount = 0, falsePositiveCount = 0;
  let faithfulnessCompared = 0, faithfulnessAgreement = 0;
  const observations: HumanObservation[] = [];
  const disagreements: { reviewId: string; criterion: string; human: string; automatic: string; reason: string }[] = [];
  if (reviewInput !== undefined) {
    const review = reviewSchema.parse(reviewInput);
    if (review.datasetHash !== packet.datasetHash || review.artifactHash !== packet.artifactHash || review.entries.length !== packet.entries.length
      || new Set(review.entries.map(e => e.reviewId)).size !== review.entries.length) throw new Error("REVIEW_IDENTITY_MISMATCH");
    for (const entry of review.entries) {
      const expected = packet.entries.find(e => e.reviewId === entry.reviewId);
      const { labels, ...contents } = entry;
      if (!expected || hash(contents) !== hash(Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "labels"))) || new Set(labels.map(l => l.criterion)).size !== 5) throw new Error("REVIEW_CONTENT_MISMATCH");
      const evaluated = batch.evaluations.find(e => reviewId(e) === entry.reviewId)!;
      for (const label of labels) {
        if (label.judgment === null) continue;
        if (!review.reviewer || !label.reason.trim()) throw new Error("HUMAN_REVIEW_ATTESTATION_REQUIRED");
        labelledCount++;
        observations.push({ reviewId: entry.reviewId, criterion: label.criterion, judgment: label.judgment });
        const automatic = evaluated.domain.checks.find(c => c.criterion === label.criterion)?.judgment;
        // Failed/abstained evaluation still misses a human-known defect.
        if (label.judgment === "FAIL") { defectCount++; if (automatic === "FAIL") detectedDefectCount++; }
        if (automatic && automatic !== "UNCERTAIN" && label.judgment !== "UNCERTAIN") {
          comparableCount++;
          // Specificity is conditional on an actual automatic judgment, not abstention.
          if (label.judgment === "PASS") { negativeCount++; if (automatic === "FAIL") falsePositiveCount++; }
          if (automatic === label.judgment) agreements++;
          else disagreements.push({ reviewId: entry.reviewId, criterion: label.criterion, human: label.judgment, automatic, reason: label.reason });
        }
        if ((!automatic || automatic === "UNCERTAIN") && label.judgment !== "UNCERTAIN")
          disagreements.push({ reviewId: entry.reviewId, criterion: label.criterion, human: label.judgment, automatic: automatic ?? "NOT_EVALUABLE", reason: label.reason });
        // Explicitly labelled strict factual-support interpretation, not a universal quality cutoff.
        if (label.criterion === "FACTUAL_SUPPORT" && label.judgment !== "UNCERTAIN" && evaluated.ragas.score !== null) {
          faithfulnessCompared++;
          if ((evaluated.ragas.score === 1) === (label.judgment === "PASS")) faithfulnessAgreement++;
        }
      }
    }
  }
  const eligibleCount = batch.evaluations.length * 5;
  const insights = analyseQuality(batch, observations, dataset);
  const review = { state: labelledCount === 0 ? "PENDING" : labelledCount === eligibleCount ? "REVIEWED" : "PARTIAL", labelledCount, eligibleCount,
    comparableCount, agreements, agreement: ratio(agreements, comparableCount), defectCount, detectedDefectCount, defectRecall: ratio(detectedDefectCount, defectCount),
    negativeCount, falsePositiveCount, falsePositiveRate: ratio(falsePositiveCount, negativeCount),
    faithfulnessCompared, faithfulnessAgreement, faithfulnessStrictAgreement: ratio(faithfulnessAgreement, faithfulnessCompared) };
  const statistics = (["DEVELOPMENT", "HOLDOUT"] as const).flatMap(partition => (["BASELINE", "CANDIDATE"] as const).map(variant => {
    const requested = batch.generation.attempts.filter(a => a.variant === variant && dataset.cases.find(c => c.caseId === a.caseId)?.partition === partition).length;
    const rows = batch.evaluations.filter(e => e.draft.partition === partition && e.draft.variant === variant);
    const scores = rows.flatMap(e => e.ragas.score === null ? [] : [e.ragas.score]);
    const evaluated = rows.filter(e => e.domain.state === "EVALUATED").length;
    const passed = rows.filter(e => e.domain.state === "EVALUATED" && e.domain.verdict === "PASS").length;
    const availableUsage = rows.flatMap(e => e.draft.usage ? [e.draft.usage.inputTokens + e.draft.usage.outputTokens] : []);
    return { partition, variant, requested, generated: rows.length, faithfulnessMeasured: scores.length, faithfulnessMean: mean(scores),
      domainEvaluated: evaluated, domainPassed: passed, domainBlocked: rows.filter(e => e.domain.verdict === "BLOCK").length,
      domainPassRate: ratio(passed, evaluated), domainCoverage: ratio(evaluated, requested),
      generationP95Ms: p95(rows.map(e => e.draft.generationMs)), generationTokenMean: mean(availableUsage), usageCoverage: ratio(availableUsage.length, requested), costMicros: null };
  }));
  const paired = batch.evaluations.flatMap(a => {
    if (a.draft.variant !== "BASELINE") return [];
    const b = batch.evaluations.find(e => e.draft.variant === "CANDIDATE" && e.draft.caseId === a.draft.caseId && e.draft.trial === a.draft.trial && e.draft.inputHash === a.draft.inputHash && e.draft.model === a.draft.model
      && hash(e.evaluator) === hash(a.evaluator) && e.evaluationMode === a.evaluationMode);
    return b ? [{ caseKey: a.draft.caseId, trial: a.draft.trial, partition: a.draft.partition,
      faithfulnessDelta: a.ragas.score === null || b.ragas.score === null ? null : b.ragas.score - a.ragas.score,
      baselineVerdict: a.domain.verdict, candidateVerdict: b.domain.verdict }] : [];
  });
  const measuredGeneration = batch.generation.kind === "GENERATION" && batch.evaluations.length > 0 && batch.evaluations.every(e => e.draft.evidenceClass === "MEASURED_TEST" && e.evaluationMode === "LIVE");
  const holdoutGroups = new Set(paired.filter(p => p.partition === "HOLDOUT").map(p => p.caseKey)).size;
  const evaluatorIssues = review.comparableCount !== review.eligibleCount || disagreements.length > 0;
  const decision = !measuredGeneration ? "NOT_EVALUABLE" : review.state !== "REVIEWED" ? "REVIEW_REQUIRED" : evaluatorIssues ? "EVALUATOR_REVIEW_REQUIRED"
    : holdoutGroups < 10 || !batch.generation.policyFreeze ? "INSUFFICIENT_HOLDOUT" : "OPERATOR_DECISION_REQUIRED";
  const summary = { schemaVersion: "dual-evaluation-summary/v1", reportId: `eval-${hash(batch).slice(0, 16)}`, projectId: "presstuner",
    createdAt: batch.generation.createdAt, datasetVersion: dataset.version, datasetHash: hash(dataset),
    sourceKind: batch.evaluations.length > 0 && batch.evaluations.every(e => e.evaluationMode === "LIVE") ? "MEASURED_TEST" : "SYNTHETIC",
    draftSource: batch.generation.kind === "AUTHORED_CHALLENGES" ? "AUTHORED" : measuredGeneration ? "GENERATED" : "MOCK",
    evaluator: { ragasVersion: RAGAS_VERSION, domainPolicy: POLICY_VERSION, judgeModel: [...new Set(batch.evaluations.map(e => e.evaluator.judgeModel))].join(",") || "not-run" },
    requestedCount: batch.generation.attempts.length, generatedCount: batch.evaluations.length, review, decision, insights,
    rows: batch.evaluations.map(e => ({ caseKey: e.draft.caseId, variant: e.draft.variant, trial: e.draft.trial, partition: e.draft.partition,
      ragas: { state: e.ragas.state, score: e.ragas.score, reasonCode: e.ragas.reasonCode },
      domain: { state: e.domain.state, verdict: e.domain.verdict, reasonCode: e.domain.reasonCode,
        checks: e.domain.checks.map(c => ({ criterion: c.criterion, judgment: c.judgment })) },
      generationMs: e.draft.generationMs, evaluationMs: e.ragas.elapsedMs + e.domain.elapsedMs,
    })) };
  return { version: "press-dual-report/v1", datasetHash: hash(dataset), artifactHash: hash(batch),
    interpretation: "Faithfulness measures support of written claims. Domain checks also measure omitted requirements and style. Scores are not interchangeable. AI_AUTHORED expectations are not human labels. These 30 synthetic launch groups share templates and are not representative production traffic.",
    review, disagreements, statistics, paired, holdoutGroups, decision, insights, deploymentAuthorized: false,
    costStatus: "UNPRICED", summary };
}
