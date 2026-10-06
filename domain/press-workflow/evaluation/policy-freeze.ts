import { hash, policyFreezeSchema, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport } from "./report";

/** Records an unchanged evaluation recipe; it does not certify evaluator reliability. */
export function freezePolicy(dataset: Dataset, batch: EvaluationBundle, review: unknown, implementationHash: string) {
  const report = buildReport(dataset, batch, review);
  if (report.review.state === "REVIEWED" && (report.disagreements.length > 0 || report.review.comparableCount !== report.review.eligibleCount))
    throw new Error("RESOLVE_EVALUATOR_DISAGREEMENTS_BEFORE_HOLDOUT");
  const models = new Set(batch.evaluations.map(e => e.draft.model));
  if (report.summary.draftSource !== "GENERATED" || report.review.state !== "REVIEWED" || models.size !== 1
    || batch.evaluations.some(e => e.draft.partition !== "DEVELOPMENT" || e.draft.provenance?.implementationHash !== implementationHash))
    throw new Error("FREEZE_REQUIRES_REVIEWED_DEVELOPMENT_GENERATION_WITH_CURRENT_PROVENANCE");
  const first = batch.evaluations[0];
  return policyFreezeSchema.parse({ version: "press-eval-policy-freeze/v1", datasetHash: hash(dataset), createdAt: new Date().toISOString(),
    implementationHash, generatorModel: first.draft.model, judgeModel: first.evaluator.judgeModel, promptHash: first.evaluator.promptHash,
    ragasVersion: first.evaluator.ragasVersion, domainPolicy: first.evaluator.domainPolicy,
    developmentArtifactHash: hash(batch), humanReviewHash: hash(review), reviewedOutputs: batch.evaluations.length });
}

export function validateFrozenPolicy(input: unknown, expected: { datasetHash: string; implementationHash: string; generatorModel?: string; judgeModel?: string; promptHash: string }) {
  const policy = policyFreezeSchema.parse(input);
  if (policy.datasetHash !== expected.datasetHash || policy.implementationHash !== expected.implementationHash || policy.promptHash !== expected.promptHash
    || (expected.generatorModel && policy.generatorModel !== expected.generatorModel) || (expected.judgeModel && policy.judgeModel !== expected.judgeModel))
    throw new Error("FROZEN_POLICY_MISMATCH_NEW_HOLDOUT_REQUIRED");
  return policy;
}
