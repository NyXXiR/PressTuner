import assert from "node:assert/strict";
import test from "node:test";

import { knowledgeDocumentPresentation } from "./documentPresentation";

test("READY successors remain replaceable after cutover", () => {
  const view = knowledgeDocumentPresentation({
    status: "READY",
    replacesDocumentId: "archived-predecessor",
    hasPendingReplacement: false,
  });

  assert.equal(view.canReplace, true);
  assert.equal(view.showPendingReplacementCopy, false);
  assert.equal(view.retryLabel, null);
});

test("saved-but-unqueued uploads expose recovery without a processing spinner", () => {
  const view = knowledgeDocumentPresentation({
    status: "UPLOADED",
    replacesDocumentId: null,
    hasPendingReplacement: false,
  });

  assert.equal(view.canRetry, true);
  assert.equal(view.retryLabel, "처리 시작");
  assert.equal(view.showSpinner, false);
  assert.equal(view.shouldPoll, false);
});

test("only actual processing states poll and pending successors explain cutover", () => {
  const queued = knowledgeDocumentPresentation({
    status: "QUEUED",
    replacesDocumentId: "old",
    hasPendingReplacement: false,
  });
  const failed = knowledgeDocumentPresentation({
    status: "FAILED",
    replacesDocumentId: "old",
    hasPendingReplacement: false,
  });

  assert.equal(queued.showSpinner, true);
  assert.equal(queued.shouldPoll, true);
  assert.equal(queued.canRetry, false);
  assert.equal(queued.showPendingReplacementCopy, true);
  assert.equal(failed.retryLabel, "재시도");
  assert.equal(failed.showPendingReplacementCopy, true);
});
