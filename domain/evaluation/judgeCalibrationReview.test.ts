import assert from "node:assert/strict";
import test from "node:test";

import { approveJudgeCalibrationReview, buildJudgeCalibrationReviewDraft } from "./judgeCalibrationReview";

test("builds a balanced 30-record blinded review without claiming human labels", () => {
  const review = buildJudgeCalibrationReviewDraft(Array.from({ length: 15 }, (_, index) => ({
    id: `seed-${index}`, factValue: `DOC-${index}`, sourceId: `source-${index}`,
    exactEvidence: `문서 식별자 DOC-${index}`,
  })));
  assert.equal(review.candidates.length, 30);
  assert.equal(review.candidates.filter(({ suggestedLabel }) => suggestedLabel === "SUPPORTED").length, 15);
  assert.equal(review.candidates.filter(({ suggestedLabel }) => suggestedLabel === "UNSUPPORTED").length, 15);
  assert.ok(review.candidates.every(({ humanLabel }) => humanLabel === null));
});

test("approval adds named human labels without changing reviewed content identity", () => {
  const draft = buildJudgeCalibrationReviewDraft(Array.from({ length: 15 }, (_, index) => ({
    id: `seed-${index}`, factValue: `DOC-${index}`, sourceId: `source-${index}`,
    exactEvidence: `문서 식별자 DOC-${index}`,
  })));
  const approved = approveJudgeCalibrationReview({
    review: draft,
    reviewerId: "nyxxir",
    approvedAt: "2026-08-04T03:00:00.000Z",
  });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.contentHash, draft.contentHash);
  assert.equal(approved.reviewer.id, "nyxxir");
  assert.ok(approved.candidates.every(({ humanLabel }) => humanLabel !== null));
});
