import assert from "node:assert/strict";
import test from "node:test";
import { newStudy, addSamples, freezeStudy, assignReviews, reviewPacket } from "../../../domain/press-workflow/evaluation/study";
import { fixtureRun } from "../../../domain/press-workflow/evaluation/study-fixture";
import { reviewCard, decisionView, reviewCommand } from "./adapter";

function packet(product: boolean) {
  const study = newStudy("UI test");
  addSamples(study, [{ run: fixtureRun("ui"), partition: "DEVELOPMENT" }]);
  freezeStudy(study, "2026-10-13T00:00:00Z");
  const batch = assignReviews(study, "reviewer", product ? "PRODUCT" : "DEVELOPMENT", "2026-10-13T00:01:00Z", () => .2);
  return reviewPacket(study, batch.id, "reviewer");
}

test("product choices describe saved intent, never claim that a draft was edited", () => {
  const p = packet(true), card = reviewCard(p, p.items[0]);
  assert.deepEqual(card.choices.map(x => x.label), ["수정 필요", "현재 내용 유지", "나중에 판단"]);
  assert.match(card.effect, /원고.*바뀌지/);
  assert.equal(card.output, p.items[0].output);
  assert.deepEqual(card.facts, p.items[0].facts);
  const command = reviewCommand(p, p.items[0], "APPLY", null);
  assert.equal(command.review.choice, "APPLY");
  assert.equal(command.review.priorExposure, "SEEN_JUDGE");
});

test("blind cards cannot display automatic assessment and require explicit exposure", () => {
  const p = packet(false);
  const item = { ...p.items[0], automatic: { reason: "SECRET_JUDGE_REASON", score: 1 } };
  const card = reviewCard(p, item as typeof p.items[number]);
  assert.equal(card.automatic, null);
  assert.doesNotMatch(JSON.stringify(card), /SECRET_JUDGE_REASON/);
  assert.throws(() => reviewCommand(p, p.items[0], "PASS", null), /EXPOSURE_REQUIRED/);
  assert.equal(reviewCommand(p, p.items[0], "UNCERTAIN", "UNKNOWN").review.priorExposure, "UNKNOWN");
  assert.throws(() => reviewCommand(p, p.items[0], "APPLY", "NONE"), /INVALID_CHOICE/);
});

test("saved revisions are used and HOLD or unknown regression cannot enable adoption", () => {
  const p = packet(false), item = { ...p.items[0], revision: 3, choice: "FAIL" as const };
  assert.equal(reviewCommand(p, item, "PASS", "NONE").review.expectedRevision, 3);
  assert.equal(decisionView({ state: "HOLD", regression: { state: "UNKNOWN" }, reasons: ["INDEPENDENT_AUDIT_INSUFFICIENT"], adoption: null }).canSelect, false);
  assert.equal(decisionView({ state: "READY_FOR_OPERATOR", regression: { state: "UNKNOWN" }, reasons: [], adoption: null }).canSelect, false);
  assert.equal(decisionView({ state: "READY_FOR_OPERATOR", regression: { state: "PASS" }, reasons: [], adoption: null }).canSelect, true);
  assert.match(decisionView({ state: "HOLD", regression: { state: "UNKNOWN" }, reasons: [], adoption: null }).regression, /판단할 근거가 부족/);
});

test("assisted excerpts come only from actual text mentioned in the reason; blind review retains full output", () => {
  const p = packet(true), item = { ...p.items[0], output: "출시 소식입니다. 월 요금은 73,000원입니다. 향후 계획은 별도입니다.", automatic: { ...p.items[0].automatic!, reason: "73,000원은 제공된 근거와 다릅니다." } };
  assert.equal(reviewCard(p, item).excerpt, "월 요금은 73,000원입니다.");
  assert.equal(reviewCard(p, { ...item, automatic: { ...item.automatic, reason: "원고에 없는 '자동 요약 서비스'라는 표현" } }).excerpt, null);
  assert.equal(reviewCard({ ...p, purpose: "AUDIT", presentation: "BLIND" }, item).excerpt, null);
});
