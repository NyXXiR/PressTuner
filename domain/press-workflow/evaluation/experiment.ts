import { CRITERIA, evaluationBundleSchema, experimentRecipeSchema, hash, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport, reviewSchema } from "./report";
import { improvementPlan } from "./regression";
import { pairedInterval, evaluationReviewId } from "./analysis";
import { auditJudges } from "./decision";
import { z } from "zod";

export const independentAuditSchema = z.object({ version: z.literal("press-independent-audit/v1"),
  purpose: z.literal("INDEPENDENT_JUDGE_AUDIT"), sampling: z.literal("PRESELECTED_BEFORE_JUDGMENTS"),
  batch: evaluationBundleSchema, review: z.unknown() }).strict();

export function assessIndependentAudit(dataset: Dataset, batch: EvaluationBundle, input?: unknown) {
  if (!input) return { state: "MISSING" as const, reasons: ["INDEPENDENT_JUDGE_AUDIT_REQUIRED"], policy: "press-judge-audit/v1", artifactHash: null };
  const audit = independentAuditSchema.parse(input);
  const report = buildReport(dataset, audit.batch, audit.review);
  const excluded = new Set([...batch.evaluations.map(e => e.draft.groupId), ...(batch.generation.experimentRecipe?.developmentGroups ?? [])]);
  if (audit.batch.evaluations.some(e => excluded.has(e.draft.groupId))) throw new Error("JUDGE_AUDIT_GROUP_LEAKAGE");
  if (!batch.evaluations.length || !audit.batch.evaluations.length || audit.batch.evaluations.some(e => hash(e.evaluator) !== hash(batch.evaluations[0].evaluator) || e.evaluationMode !== "LIVE")) throw new Error("JUDGE_AUDIT_EVALUATOR_MISMATCH");
  const groups = new Set(audit.batch.evaluations.map(e => e.draft.groupId)).size;
  const metrics = auditJudges(dataset, audit.batch, audit.review).filter(a => a.evaluator === "DOMAIN");
  const labels = reviewSchema.parse(audit.review);
  const reasons: string[] = [];
  // Versioned experimental screening policy, not a population-accuracy certificate.
  if (groups < 10) reasons.push("TOO_FEW_AUDIT_GROUPS");
  if (report.review.state !== "REVIEWED") reasons.push("INCOMPLETE_AUDIT_LABELS");
  if (metrics.some(m => m.compared < 10 || m.humanDefects < 3 || m.trueNegative + m.falsePositive < 3 || m.coverage !== 1 || m.humanUncertain > 0)) reasons.push("INSUFFICIENT_AUDIT_COVERAGE");
  if (CRITERIA.some(criterion => ["PASS", "FAIL"].some(judgment => new Set(audit.batch.evaluations.filter(e => labels.entries.find(r => r.reviewId === evaluationReviewId(e))?.labels.some(l => l.criterion === criterion && l.judgment === judgment)).map(e => e.draft.groupId)).size < 3))) reasons.push("INSUFFICIENT_AUDIT_CLASS_GROUPS");
  if (metrics.some(m => (m.endToEndDefectRecall ?? 0) < .9 || (m.falsePositiveRate ?? 1) > .1)) reasons.push("AUDIT_ERRORS_EXCEED_POLICY");
  return { state: reasons.length ? "INSUFFICIENT" as const : "SCREEN_PASSED" as const, reasons, policy: "press-judge-audit/v1", artifactHash: hash(audit), groups, metrics };
}

export function freezeExperiment(dataset: Dataset, batch: EvaluationBundle, review: unknown, implementationHash: string, generatorModel: string) {
  const plan = improvementPlan(dataset, batch, review);
  if (!plan.instructions.length || !batch.evaluations.length) throw new Error("IMPROVEMENT_HYPOTHESIS_REQUIRED");
  const evaluator = batch.evaluations[0].evaluator;
  return experimentRecipeSchema.parse({ version: "press-quality-recipe/v1", datasetHash: hash(dataset), implementationHash, createdAt: new Date().toISOString(),
    generatorModel, judgeModel: evaluator.judgeModel, judge: evaluator.domainFramework ? "deepeval" : "custom", evaluatorPromptHash: evaluator.promptHash,
    sourceArtifactHash: hash(batch), developmentGroups: [...new Set(batch.evaluations.map(e => e.draft.groupId))], instructions: plan.instructions,
    reliability: "NOT_CERTIFIED" });
}

/** Frozen execution recipe and evidence for an adoption decision are separate contracts. */
export function compareExperiment(dataset: Dataset, batch: EvaluationBundle, auditInput?: unknown) {
  const report = buildReport(dataset, batch);
  const recipe = batch.generation.experimentRecipe;
  const reasons: string[] = [];
  if (!recipe) reasons.push("MISSING_FROZEN_RECIPE");
  const holdout = batch.generation.attempts.filter(a => dataset.cases.find(c => c.caseId === a.caseId)?.partition === "HOLDOUT");
  const groups = [...new Set(holdout.map(a => a.caseId))];
  if (!groups.length) reasons.push("NO_INDEPENDENT_HOLDOUT");
  if (batch.generation.kind !== "GENERATION" || batch.evaluations.some(e => e.evaluationMode !== "LIVE" || e.draft.evidenceClass !== "MEASURED_TEST")) reasons.push("NOT_LIVE_GENERATION");
  if (recipe && batch.evaluations.some(e => e.draft.model !== recipe.generatorModel || e.evaluator.judgeModel !== recipe.judgeModel || e.evaluator.promptHash !== recipe.evaluatorPromptHash
    || e.draft.provenance?.implementationHash !== recipe.implementationHash || (e.draft.partition === "HOLDOUT" && recipe.developmentGroups.includes(e.draft.groupId)))) reasons.push("RECIPE_OR_PARTITION_MISMATCH");
  const comparisons = CRITERIA.map(criterion => {
    const deltas: number[] = [];
    let regressions = 0, improvements = 0, unknownGroups = 0;
    for (const caseId of groups) {
      const attempts = holdout.filter(a => a.caseId === caseId);
      const trials = [...new Set(attempts.map(a => a.trial))];
      const pairs = trials.map(trial => {
        const a = batch.evaluations.find(e => e.draft.caseId === caseId && e.draft.trial === trial && e.draft.variant === "BASELINE");
        const b = batch.evaluations.find(e => e.draft.caseId === caseId && e.draft.trial === trial && e.draft.variant === "CANDIDATE");
        if (!a || !b || a.draft.inputHash !== b.draft.inputHash || hash(a.evaluator) !== hash(b.evaluator)) return null;
        const left = a.domain.checks.find(c => c.criterion === criterion)?.judgment, right = b.domain.checks.find(c => c.criterion === criterion)?.judgment;
        if (!left || !right || left === "UNCERTAIN" || right === "UNCERTAIN") return null;
        return Number(right === "PASS") - Number(left === "PASS");
      });
      if (!pairs.length || pairs.some(p => p === null)) { unknownGroups++; continue; }
      const observed = pairs as number[];
      if (observed.some(n => n < 0)) regressions++;
      if (observed.some(n => n > 0)) improvements++;
      deltas.push(observed.reduce((a, b) => a + b, 0) / observed.length);
    }
    return { criterion, groupCount: groups.length, measuredGroups: deltas.length, unknownGroups, regressions, improvements, ...pairedInterval(deltas) };
  });
  if (comparisons.some(c => c.unknownGroups > 0)) reasons.push("INCOMPLETE_EVALUATION");
  if (comparisons.some(c => c.regressions > 0)) reasons.push("OBSERVED_REGRESSION");
  const targets = new Set(recipe?.instructions.map(i => i.criterion) ?? []);
  if (groups.length < 10 || !comparisons.some(c => targets.has(c.criterion) && c.state === "EXPLORATORY" && c.interval && c.interval.low > 0)) reasons.push("INSUFFICIENT_EFFECT_EVIDENCE");
  const judgeAudit = assessIndependentAudit(dataset, batch, auditInput);
  reasons.push(...judgeAudit.reasons);
  return { version: "press-quality-experiment/v1", artifactHash: hash(batch), recipeHash: recipe ? hash(recipe) : null,
    state: reasons.includes("OBSERVED_REGRESSION") ? "REGRESSION" : reasons.length ? "HOLD" : "READY_FOR_OPERATOR", reasons: [...new Set(reasons)], comparisons, judgeAudit,
    faithfulness: report.insights.paired, operational: report.statistics,
    adoption: "OPERATOR_DECISION_REQUIRED", deploymentAuthorized: false as const };
}
