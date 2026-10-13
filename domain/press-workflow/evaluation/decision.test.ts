import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { datasetSchema, evaluationBundleSchema, hash } from "./contracts";
import { auditJudges, decisionAnalysis, rebindReview } from "./decision";
import { createReviewSession, selectAnswer } from "./quick-review";

const dataset = datasetSchema.parse(JSON.parse(readFileSync("evals/press-workflow/dual/v1/dataset.json", "utf8")));
const fixture = JSON.parse(readFileSync(new URL("./analysis-fixture.json", import.meta.url), "utf8"));

test("human audit separates false negatives from unavailable judgments and never inflates accuracy", () => {
  const a = auditJudges(dataset, fixture.batch, fixture.review);
  const custom = a.find(r => r.evaluator === "DOMAIN" && r.criterion === "PROMOTIONAL_CLAIMS")!;
  assert.equal(custom.humanDefects, 2);
  assert.equal(custom.falseNegative, 1);
  assert.equal(custom.unavailable, 1);
  assert.equal(custom.endToEndDefectRecall, 0);
  assert.equal(custom.scope, "REVIEWED_SAMPLE_ONLY");
  assert.equal(a.filter(r => r.evaluator === "RAGAS").length, 1);
});

test("same-output human labels can audit another evaluator but cannot move to regenerated text", () => {
  const other = structuredClone(fixture.batch);
  other.evaluations.forEach((e: { evaluator: { judgeModel: string } }) => { e.evaluator.judgeModel = "other-judge"; });
  const copied = rebindReview(dataset, fixture.batch, fixture.review, other);
  assert.equal(copied.artifactHash, hash(other));
  assert.deepEqual(copied.entries, fixture.review.entries);
  other.evaluations[0].draft.text += "x";
  other.evaluations[0].draft.outputHash = hash(other.evaluations[0].draft.text);
  other.generation.attempts[0].draft = other.evaluations[0].draft;
  assert.throws(() => rebindReview(dataset, fixture.batch, fixture.review, other), /OUTPUT|GENERATION/);
});

test("adaptive decisions prioritize confirmed defects; unavailable results cannot become ready", () => {
  const analysis = decisionAnalysis(dataset, fixture.batch, fixture.review);
  assert.equal(analysis.cards.length, 2);
  assert.ok(analysis.cards.every(c => c.state === "FIX_REQUIRED"));
  assert.ok(analysis.cards.every(c => c.findings.some(f => f.criterion === "PROMOTIONAL_CLAIMS" && f.source === "HUMAN")));
  const unreviewed = decisionAnalysis(dataset, evaluationBundleSchema.parse(fixture.batch));
  assert.ok(unreviewed.cards.some(c => c.state === "REVIEW_REQUIRED"));
  assert.equal(analysis.deploymentAuthorized, false);
});

test("adaptive queue caps questions, preserves random audit and rejects unselected criteria", () => {
  const s = createReviewSession(dataset, fixture.batch, undefined, 2, "seed", 3);
  assert.ok(s.queue.reduce((n, q) => n + q.criteria!.length, 0) <= 3);
  assert.equal(s.queue[0].selection, "RANDOM_AUDIT");
  const q = s.queue[0];
  const omitted = ["FACTUAL_SUPPORT", "REQUIRED_FACTS", "STYLE_LEAKAGE", "PROMOTIONAL_CLAIMS", "REQUESTED_STYLE"].find(c => !q.criteria!.includes(c as never))!;
  assert.throws(() => selectAnswer(s, { sessionId: s.sessionId, revision: 0, reviewId: q.reviewId, criterion: omitted, judgment: "PASS", confirmed: true }), /UNSELECTED/);
  const answered = selectAnswer(s, { sessionId: s.sessionId, revision: 0, reviewId: q.reviewId, criterion: q.criteria![0], judgment: "UNCERTAIN", confirmed: true, displayedMs: 1250 });
  assert.equal(answered.events[0].displayedMs, 1250);
  assert.equal(answered.events[0].judgment, "UNCERTAIN");
});
