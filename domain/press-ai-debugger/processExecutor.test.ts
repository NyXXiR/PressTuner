import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedPlain,
  derivePressCreationHandoff,
  validateSelectedReviewNotes,
} from "./processExecutor";

test("Press handoffs are derived by the production executor", () => {
  assert.deepEqual(derivePressCreationHandoff("article-initialization", { articleId: "article-1" }), { articleId: "article-1" });
  assert.equal(buildGeneratedPlain({ lead: "리드", paragraphs: [{ text: "본문" }], closing: "끝" }), "리드\n\n본문\n\n끝");
});

test("selected rewrite notes must be available and non-empty", () => {
  assert.deepEqual(validateSelectedReviewNotes(["n2"], [{ id: "n1" }, { id: "n2" }]), ["n2"]);
  assert.throws(() => validateSelectedReviewNotes([], [{ id: "n1" }]), /PRESS_AI_REVIEW_NOTE_REQUIRED/);
  assert.throws(() => validateSelectedReviewNotes(["missing"], [{ id: "n1" }]), /PRESS_AI_REVIEW_NOTE_INVALID/);
});

