import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { datasetSchema } from "./contracts";
import { buildReport } from "./report";
import { createReviewSession, selectAnswer } from "./quick-review";

test("bounded blind queue preserves audit selection and records only explicit choices", async () => {
  const fixture = JSON.parse(await readFile(new URL("./analysis-fixture.json", import.meta.url), "utf8"));
  const dataset = datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8")));
  const s = createReviewSession(dataset, fixture.batch, undefined, 2, "seed");
  assert.equal(s.queue.length, 2);
  assert.equal(s.queue[0].selection, "RANDOM_AUDIT");
  assert.equal(s.packet.reviewer, null);
  assert.equal(buildReport(dataset, fixture.batch, s.packet).review.labelledCount, 0);
  const next = selectAnswer(s, { sessionId: s.sessionId, revision: 0, reviewId: s.queue[0].reviewId, criterion: "FACTUAL_SUPPORT", judgment: "FAIL", confirmed: true });
  assert.equal(next.revision, 1);
  assert.equal(buildReport(dataset, fixture.batch, next.packet).review.labelledCount, 1);
  assert.equal(s.packet.reviewer, null);
  assert.throws(() => selectAnswer(next, { sessionId: s.sessionId, revision: 0, reviewId: s.queue[0].reviewId, criterion: "FACTUAL_SUPPORT", judgment: "PASS", confirmed: true }));
  assert.throws(() => selectAnswer(s, { sessionId: s.sessionId, revision: 0, reviewId: "0".repeat(64), criterion: "FACTUAL_SUPPORT", judgment: "PASS", confirmed: true }));
  const restored = selectAnswer(next, { sessionId: s.sessionId, revision: 1, reviewId: s.queue[0].reviewId, criterion: "FACTUAL_SUPPORT", judgment: null, confirmed: true });
  assert.equal(buildReport(dataset, fixture.batch, restored.packet).review.labelledCount, 0);
});

test("imported human work is preserved and already-reviewed entries do not ask again", async () => {
  const fixture = JSON.parse(await readFile(new URL("./analysis-fixture.json", import.meta.url), "utf8"));
  const dataset = datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8")));
  const session = createReviewSession(dataset, fixture.batch, fixture.review, 2, "seed");
  assert.equal(session.queue.length, 0);
  assert.deepEqual(session.packet, fixture.review);
});
