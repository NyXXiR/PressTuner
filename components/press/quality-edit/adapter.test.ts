import assert from "node:assert/strict";
import test from "node:test";
import { draftChanges, selectChanges, sameDraft, qualitySummary, revisionInstruction } from "./adapter";
import { fixtureRun } from "../../../domain/press-workflow/evaluation/study-fixture";

test("selected changes preserve whitespace and repeated passages; all selections reconstruct the exact candidate", () => {
  const base = { title: "소식", plain: "같은 문장.\n\n요금은 73,000원이다. 그대로다.\n\n같은 문장.\n끝." };
  const next = { title: "새 소식", plain: "같은 문장.\n\n요금은 7,300원이다. 그대로다.\n\n같은 문장.\n새 문장.\n끝." };
  const changes = draftChanges(base, next);
  assert.ok(changes.length >= 3);
  assert.deepEqual(selectChanges(base, changes, []), base);
  assert.deepEqual(selectChanges(base, changes, changes.map(c => c.id)), next);
  const price = changes.find(c => c.before.includes("73,000"))!;
  assert.ok(price);
  assert.deepEqual(selectChanges(base, changes, [price.id]), { ...base, plain: base.plain.replace("73,000", "7,300") });
  assert.equal(sameDraft(base, next), false);
});

test("insertions, deletions, decimals and empty title reconstruct without treating dollar replacement tokens as code", () => {
  for (const [before, after] of [["", "새 본문"], ["삭제. 남김.", "남김."], ["수치 12.5%입니다.\n\n", "수치 13.5%입니다.\n$& $`"], ["반복\n반복\n", "반복\n"], ["", ""]]) {
    const base = { title: "제목", plain: before }, next = { title: "", plain: after };
    const changes = draftChanges(base, next);
    assert.deepEqual(selectChanges(base, changes, changes.map(c => c.id)), next);
  }
});

test("quality summary never turns unavailable checks or threshold passes into verified correctness", () => {
  const run = fixtureRun("view", .2);
  assert.equal(qualitySummary(run).issues.length, 1);
  run.results[0].thresholdPassed = true; run.results[0].score = 1;
  assert.match(qualitySummary(run).title, /자동 확인/);
  run.status = "PARTIAL"; run.results[0].state = "FAILED";
  assert.equal(qualitySummary(run).issues.length, 0);
  assert.match(qualitySummary(run).title, /완료하지 못/);
  assert.match(revisionInstruction(fixtureRun("instruction", .2)), /hidden automatic rationale/);
  assert.match(revisionInstruction(fixtureRun("instruction", .2)), /참고 데이터/);
});
