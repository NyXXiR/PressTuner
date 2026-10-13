import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { datasetSchema, evaluationBundleSchema, hash, scenarioInputHash, type EvaluationBundle, type Scenario } from "./contracts";
import { freezeExperiment, compareExperiment, assessIndependentAudit } from "./experiment";
import { reviewPacket } from "./report";
import { evaluationReviewId } from "./analysis";
import { resolveDraftConfiguration } from "../configuration";

const dataset = datasetSchema.parse(JSON.parse(readFileSync("evals/press-workflow/dual/v1/dataset.json", "utf8")));
const fixture = JSON.parse(readFileSync(new URL("./analysis-fixture.json", import.meta.url), "utf8"));
test("recipe can freeze with partial review and disagreements without certifying a judge", () => {
  const partial = structuredClone(fixture.review);
  partial.entries[0].labels[0].judgment = null;
  const recipe = freezeExperiment(dataset, fixture.batch, partial, hash("implementation"), "generator");
  assert.equal(recipe.reliability, "NOT_CERTIFIED");
  assert.ok(recipe.instructions.some(i => i.criterion === "PROMOTIONAL_CLAIMS"));
  assert.equal(recipe.generatorModel, "generator");
});
test("development observations cannot claim independent improvement or authorize deployment", () => {
  const comparison = compareExperiment(dataset, fixture.batch);
  assert.equal(comparison.state, "HOLD");
  assert.ok(comparison.reasons.includes("NO_INDEPENDENT_HOLDOUT"));
  assert.ok(comparison.reasons.includes("INDEPENDENT_JUDGE_AUDIT_REQUIRED"));
  assert.equal(comparison.deploymentAuthorized, false);
});

test("calibration labels cannot be reused as independent judge audit", () => {
  assert.throws(() => assessIndependentAudit(dataset, fixture.batch, { version: "press-independent-audit/v1", purpose: "INDEPENDENT_JUDGE_AUDIT", sampling: "PRESELECTED_BEFORE_JUDGMENTS", batch: fixture.batch, review: fixture.review }), /GROUP_LEAKAGE/);
});

test("forged source groups and partitions cannot masquerade as independent evidence", () => {
  for (const field of ["groupId", "partition"] as const) {
    const batch = structuredClone(fixture.batch);
    for (const e of batch.evaluations) e.draft[field] = field === "groupId" ? "invented-independent-group" : "HOLDOUT";
    for (const a of batch.generation.attempts) a.draft[field] = field === "groupId" ? "invented-independent-group" : "HOLDOUT";
    assert.throws(() => compareExperiment(dataset, batch), /REPORT_IDENTITY_MISMATCH/);
  }
});

test("independent audit and paired evidence are both required before an operator decision", () => {
  // In-memory synthetic gate fixtures only: these simulated labels are never saved as human evidence.
  const recipe = freezeExperiment(dataset, fixture.batch, fixture.review, hash("test-runner"), "gpt-4.1-mini");
  function simulated(cases: Scenario[], audit: boolean): EvaluationBundle {
    const evaluations = cases.flatMap((c, index) => (["BASELINE", "CANDIDATE"] as const).map(variant => {
      const e = structuredClone(fixture.batch.evaluations[0]);
      Object.assign(e.draft, { caseId: c.caseId, groupId: c.groupId, partition: c.partition, variant, inputHash: scenarioInputHash(c), text: c.challenges[0].text, outputHash: hash(c.challenges[0].text), model: recipe.generatorModel });
      const configuration = resolveDraftConfiguration({ revision: "synthetic-gate-test", model: recipe.generatorModel, tone: "friendly", stylePolicy: c.requestedStyle, requiredPhrases: [], forbiddenPhrases: [] });
      const request = { model: recipe.generatorModel, messages: [{ role: "user", content: c.request }], responseFormat: { type: "json_object" } };
      e.draft.provenance = { implementationHash: recipe.implementationHash, configuration: configuration.snapshot, request, requestHash: hash(request) };
      e.draft.configurationHash = configuration.contentHash;
      e.contextHash = hash(c.facts);
      for (const check of e.domain.checks) {
        check.judgment = audit ? index < 5 ? "FAIL" : "PASS" : variant === "BASELINE" && index < 8 && check.criterion === "PROMOTIONAL_CLAIMS" ? "FAIL" : "PASS";
        check.evidence = [];
      }
      e.domain.verdict = e.domain.checks.some((x: { judgment: string }) => x.judgment === "FAIL") ? "BLOCK" : "PASS";
      return e;
    }));
    return evaluationBundleSchema.parse({ version: "press-eval-batch/v1", evaluations, generation: {
      ...fixture.batch.generation, ...(audit ? {} : { experimentRecipe: recipe }),
      attempts: evaluations.map(e => ({ caseId: e.draft.caseId, variant: e.draft.variant, trial: e.draft.trial, draft: e.draft, errorCode: null })),
    } });
  }
  const batch = simulated(dataset.cases.filter(c => c.partition === "HOLDOUT"), false);
  assert.equal(compareExperiment(dataset, batch).state, "HOLD");
  const auditBatch = simulated(dataset.cases.filter(c => c.partition === "DEVELOPMENT" && !recipe.developmentGroups.includes(c.groupId)).slice(0, 10), true);
  const packet = reviewPacket(dataset, auditBatch);
  const review = { ...packet, reviewer: fixture.review.reviewer, entries: packet.entries.map(r => ({ ...r, labels: r.labels.map(l => ({ ...l,
    judgment: auditBatch.evaluations.find(e => evaluationReviewId(e) === r.reviewId)!.domain.checks.find(x => x.criterion === l.criterion)!.judgment,
    reason: "Synthetic unit-test label only",
  })) })) };
  const audit = { version: "press-independent-audit/v1", purpose: "INDEPENDENT_JUDGE_AUDIT", sampling: "PRESELECTED_BEFORE_JUDGMENTS", batch: auditBatch, review };
  const ready = compareExperiment(dataset, batch, audit);
  assert.equal(ready.state, "READY_FOR_OPERATOR");
  assert.equal(ready.deploymentAuthorized, false);
  review.entries[0].labels[0].judgment = "UNCERTAIN";
  assert.equal(compareExperiment(dataset, batch, audit).state, "HOLD");
});
