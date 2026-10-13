import test from "node:test";
import assert from "node:assert/strict";
import { hash } from "./contracts";
import { fixtureRun } from "./study-fixture";
import { newStudy, addSamples, freezeStudy, assignReviews, submitReview, reviewPacket, freezeCalibration, studyReport, agreement, planExperiment, assignPairwise, submitPairwise, promoteStudyRegression, studyRegressionGate, experimentReport, type Study } from "./study";

const now = "2026-10-12T00:01:00Z";
const study = () => newStudy("study");
test("frozen dataset enforces source-group splits, ownership and deduplication", () => {
  const s = study(); addSamples(s, [{ run: fixtureRun("a"), partition: "CALIBRATION" }]);
  assert.throws(() => addSamples(s, [{ run: fixtureRun("b", 1, "a"), partition: "AUDIT" }]), /GROUP_SPLIT/);
  assert.equal(s.samples.length, 1);
  assert.throws(() => addSamples(s, [{ run: fixtureRun("a"), partition: "CALIBRATION" }]), /DUPLICATE/);
  freezeStudy(s, now); assert.throws(() => addSamples(s, [{ run: fixtureRun("c"), partition: "AUDIT" }]), /FROZEN/);
});
test("review batches are bounded, blind and revisioned; product choices never become golden labels", () => {
  const s = study(); addSamples(s, [...Array.from({ length: 5 }, (_, i) => ({ run: fixtureRun(`a${i}`), partition: "CALIBRATION" as const })), { run: fixtureRun("dev"), partition: "DEVELOPMENT" }]); freezeStudy(s, now);
  const batch = assignReviews(s, "human", "CALIBRATION", now, () => .2);
  assert.equal(batch.items.length, 3);
  assert.equal(assignReviews(s, "human", "CALIBRATION", now, () => .9).id, batch.id);
  const packet = reviewPacket(s, batch.id, "human"); const serialized = JSON.stringify(packet);
  assert.ok(!serialized.includes("hidden automatic") && !serialized.includes("profileHash") && !serialized.includes('"score"'));
  assert.throws(() => reviewPacket(s, batch.id, "intruder"), /REVIEW_OWNER/);
  const item = batch.items[0];
  submitReview(s, { batchId: batch.id, itemId: item.id, expectedRevision: 0, choice: "FAIL", priorExposure: "NONE" }, "human", now);
  assert.throws(() => submitReview(s, { batchId: batch.id, itemId: item.id, expectedRevision: 0, choice: "PASS", priorExposure: "NONE" }, "human", now), /REVISION/);
  submitReview(s, { batchId: batch.id, itemId: item.id, expectedRevision: 1, choice: "PASS", priorExposure: "NONE" }, "human", now);
  assert.equal(s.reviews.length, 2); assert.equal(studyReport(s).references.length, 1);
  const p = assignReviews(s, "operator", "PRODUCT", now, () => .2);
  submitReview(s, { batchId: p.id, itemId: p.items[0].id, expectedRevision: 0, choice: "KEEP", priorExposure: "SEEN_JUDGE" }, "operator", now);
  assert.equal(studyReport(s).references.length, 1);
});
test("audit starts only after calibration freeze; uncertainty, conflicts and exposure stay out of golden references", () => {
  const s = study(); addSamples(s, [{ run: fixtureRun("a", .2), partition: "CALIBRATION" }, { run: fixtureRun("b"), partition: "AUDIT" }]); freezeStudy(s, now);
  assert.throws(() => assignReviews(s, "human", "AUDIT", now, () => .2), /POLICY_REQUIRED/);
  const a = assignReviews(s, "human", "CALIBRATION", now, () => .2);
  submitReview(s, { batchId: a.id, itemId: a.items[0].id, expectedRevision: 0, choice: "FAIL", priorExposure: "UNKNOWN" }, "human", now);
  assert.equal(studyReport(s).references.length, 0);
  freezeCalibration(s, now); assert.equal(s.policy?.state, "INSUFFICIENT");
  const b = assignReviews(s, "second", "AUDIT", now, () => .2);
  submitReview(s, { batchId: b.id, itemId: b.items[0].id, expectedRevision: 0, choice: "UNCERTAIN", priorExposure: "NONE" }, "second", now);
  assert.equal(studyReport(s).references.length, 0);
  assert.throws(() => freezeCalibration(s, now), /POLICY_FROZEN/);
});
test("agreement reports missing/degenerate denominators and real independent raters", () => {
  assert.equal(agreement([]).kappa, null);
  assert.equal(agreement([["PASS", "PASS"], ["PASS", "PASS"]]).kappa, null);
  const a = agreement([["PASS", "PASS"], ["PASS", "FAIL"], ["FAIL", "PASS"], ["FAIL", "FAIL"]]);
  assert.equal(a.rawAgreement, .5); assert.equal(a.kappa, 0);
});
test("judge replay with a new criterion keeps the previous human reference non-comparable", () => {
  const s = study(), source = fixtureRun("source");
  addSamples(s, [{ run: source, partition: "DEVELOPMENT" }]); freezeStudy(s, now);
  const evaluator = structuredClone(source.profile); evaluator.metrics[0].id = "NEW_CRITERION";
  s.judgeReplays.push({ id: "replay", sampleId: "source", evaluator, status: "FAILED", token: "token", deadlineAt: now, run: null, error: "MODEL_FAILED" });
  const metric = studyReport(s).judgeComparisons[0].metrics[0];
  assert.equal(metric.comparableDefinition, false); assert.equal(metric.reference, null); assert.equal(metric.original, null);
});
test("frozen improvement uses development only; pairwise order mapping and regression are explicit", () => {
  const s = study(); addSamples(s, [{ run: fixtureRun("dev", .2), partition: "DEVELOPMENT" }, { run: fixtureRun("hold"), partition: "HOLDOUT" }]); freezeStudy(s, now);
  const e = planExperiment(s, { sampleIds: ["hold"], generatorModel: "fixture", generatorHash: "generator", evaluator: fixtureRun("hold").profile, now });
  assert.ok(e.instructions.length); assert.equal(e.state, "FROZEN");
  const recipe = experimentReport(s, e).recipe;
  assert.deepEqual(recipe.instructions, e.instructions); assert.deepEqual(recipe.sampleIds, ["hold"]);
  assert.equal(recipe.generatorModel, "fixture"); assert.equal(recipe.evaluatorProfileHash, hash(e.evaluator));
  assert.throws(() => assignPairwise(s, e.id, "hold", "human", now, () => 0), /OUTPUTS_REQUIRED/);
  e.outputs.push(...(["BASELINE", "CANDIDATE"] as const).map(variant => ({ sampleId: "hold", variant, output: variant, outputHash: hash(variant), generation: { evidence: "MEASURED" as const, model: "fixture", recipeHash: e.recipeHash, requestHash: "request", elapsedMs: 1, usage: null } })));
  const pair = assignPairwise(s, e.id, "hold", "human", now, () => 0);
  submitPairwise(s, pair.id, "human", "A", "NONE", 0, now);
  assert.equal(s.pairwiseVotes[0].winner, pair.a);
  assert.throws(() => promoteStudyRegression(s, "dev", "FACTUAL_SUPPORT", now), /HUMAN_FAILURE/);
  const b = assignReviews(s, "human", "DEVELOPMENT", now, () => 0);
  submitReview(s, { batchId: b.id, itemId: b.items[0].id, expectedRevision: 0, choice: "FAIL", priorExposure: "NONE" }, "human", now);
  promoteStudyRegression(s, "dev", "FACTUAL_SUPPORT", now);
  assert.equal(studyRegressionGate(s, e).state, "UNKNOWN");
});

function labelPartition(s: Study, purpose: "CALIBRATION" | "AUDIT", reviewer: string, judgment: (output: string) => "PASS" | "FAIL") {
  for (let n = 0; n < 30; n++) {
    let b;
    try { b = assignReviews(s, reviewer, purpose, now, () => .4); } catch (e) { if ((e as Error).message === "NO_REVIEW_ITEMS") return; throw e; }
    const packet = reviewPacket(s, b.id, reviewer);
    for (const item of packet.items) submitReview(s, { batchId: b.id, itemId: item.id, expectedRevision: 0, choice: judgment(item.output), priorExposure: "NONE" }, reviewer, now);
  }
  throw new Error("unbounded review batches");
}
test("calibration and audit keep exact confusion denominators, frozen policy and clustered uncertainty", () => {
  const s = study();
  addSamples(s, ["CALIBRATION", "AUDIT"].flatMap(p => Array.from({ length: 10 }, (_, i) => ({ run: fixtureRun(`${p}-${i}`, p === "CALIBRATION" && i < 3 ? .2 : .9), partition: p as "CALIBRATION" | "AUDIT" })))); freezeStudy(s, now);
  labelPartition(s, "CALIBRATION", "human1", output => Number(output.split("-").at(-1)) < 3 ? "FAIL" : "PASS");
  const policy = freezeCalibration(s, now); assert.equal(policy.state, "EXPLORATORY"); assert.equal(policy.thresholds[0].threshold, .9);
  labelPartition(s, "AUDIT", "human2", output => Number(output.split("-").at(-1)) < 3 ? "FAIL" : "PASS");
  const row = studyReport(s).metrics.find(x => x.partition === "AUDIT")!;
  assert.equal(row.falseNegative, 3); assert.equal(row.trueNegative, 7); assert.equal(row.endToEndDefectRecall, 0); assert.equal(row.coverage, 1); assert.equal(row.groups, 10);
  assert.equal(row.thresholdSource, "FROZEN_CALIBRATION"); assert.equal(row.reliability, "OBSERVED_AUDIT_ONLY");
  assert.equal(policy.thresholds[0].threshold, .9); // Audit failure cannot tune the frozen threshold.
});
test("independent disagreement is retained and does not become a consensus label", () => {
  const s = study(); addSamples(s, [{ run: fixtureRun("a"), partition: "CALIBRATION" }]); freezeStudy(s, now);
  labelPartition(s, "CALIBRATION", "first", () => "PASS"); labelPartition(s, "CALIBRATION", "second", () => "FAIL");
  const report = studyReport(s); assert.equal(report.references.length, 0); assert.equal(report.interRater[0].rawAgreement, 0); assert.equal(s.reviews.length, 2);
});
test("regression fails on a known defect, passes only matching evidence, and keeps missing/different inputs unknown", () => {
  const s = study(), source = fixtureRun("dev", .2); addSamples(s, [{ run: source, partition: "DEVELOPMENT" }]); freezeStudy(s, now);
  const b = assignReviews(s, "human", "DEVELOPMENT", now, () => 0);
  submitReview(s, { batchId: b.id, itemId: b.items[0].id, expectedRevision: 0, choice: "FAIL", priorExposure: "NONE" }, "human", now);
  promoteStudyRegression(s, "dev", "FACTUAL_SUPPORT", now);
  const e = planExperiment(s, { sampleIds: ["dev"], generatorModel: "fixture", generatorHash: "generator", evaluator: source.profile, now });
  e.outputs.push({ sampleId: "dev", variant: "CANDIDATE", output: source.snapshot.input.output, outputHash: hash(source.snapshot.input.output), generation: { evidence: "MEASURED", model: "fixture", recipeHash: e.recipeHash, requestHash: "r", elapsedMs: 1, usage: null }, evaluation: structuredClone(source) });
  const measured = experimentReport(s, e).operational[0];
  assert.equal(measured.outputHash, hash(source.snapshot.input.output));
  assert.equal(measured.evaluation!.id, source.id); assert.equal(measured.evaluation!.metrics[0].score, .2);
  assert.equal(studyRegressionGate(s, e).exitCode, 1);
  e.outputs[0].evaluation!.results[0].score = 1; e.outputs[0].evaluation!.results[0].thresholdPassed = true;
  assert.equal(studyRegressionGate(s, e).exitCode, 0);
  e.outputs[0].evaluation!.snapshot.input.contexts = ["different evidence"];
  assert.equal(studyRegressionGate(s, e).exitCode, 2);
  assert.equal(experimentReport(s, e).state, "HOLD");
});
test("complete synthetic evidence reaches operator screening without authorizing deployment", () => {
  const s = study();
  addSamples(s, [{ run: fixtureRun("dev", .1), partition: "DEVELOPMENT" }, ...(["CALIBRATION", "AUDIT", "HOLDOUT"] as const).flatMap(partition => Array.from({ length: 10 }, (_, i) => ({ run: fixtureRun(`${partition}-${i}`, i < 3 ? .1 : .9), partition })))]);
  freezeStudy(s, now);
  labelPartition(s, "CALIBRATION", "calibrator", output => Number(output.split("-").at(-1)) < 3 ? "FAIL" : "PASS"); freezeCalibration(s, now);
  labelPartition(s, "AUDIT", "auditor", output => Number(output.split("-").at(-1)) < 3 ? "FAIL" : "PASS");
  const review = assignReviews(s, "developer", "DEVELOPMENT", now, () => 0);
  submitReview(s, { batchId: review.id, itemId: review.items[0].id, expectedRevision: 0, choice: "FAIL", priorExposure: "NONE" }, "developer", now);
  promoteStudyRegression(s, "dev", "FACTUAL_SUPPORT", now);
  const sampleIds = ["dev", ...Array.from({ length: 10 }, (_, i) => `HOLDOUT-${i}`)], profile = s.samples[0].run.profile;
  const e = planExperiment(s, { sampleIds, generatorModel: "fixture", generatorHash: "generator", evaluator: profile, now });
  for (const [index, sampleId] of sampleIds.entries()) for (const variant of ["BASELINE", "CANDIDATE"] as const) {
    const source = s.samples.find(x => x.id === sampleId)!.run;
    const evaluation = structuredClone(source), score = variant === "CANDIDATE" ? 1 : index % 2 ? .4 : .5;
    evaluation.results[0].score = score; evaluation.results[0].thresholdPassed = score >= .8;
    e.outputs.push({ sampleId, variant, output: source.snapshot.input.output, outputHash: hash(source.snapshot.input.output), generation: { evidence: "MEASURED", model: "fixture", recipeHash: e.recipeHash, requestHash: "fixture-only", elapsedMs: 1, usage: null }, evaluation });
  }
  for (const step of e.steps) step.status = "COMPLETED";
  for (const sampleId of sampleIds.slice(1)) { const p = assignPairwise(s, e.id, sampleId, "blind-voter", now, () => 0); submitPairwise(s, p.id, "blind-voter", p.a === "CANDIDATE" ? "A" : "B", "NONE", 0, now); }
  const report = experimentReport(s, e); assert.equal(report.state, "READY_FOR_OPERATOR"); assert.equal(report.deploymentAuthorized, false);
  s.samples.find(x => x.id === "AUDIT-0")!.run.results[0].score = 1;
  assert.equal(experimentReport(s, e).state, "HOLD");
});
