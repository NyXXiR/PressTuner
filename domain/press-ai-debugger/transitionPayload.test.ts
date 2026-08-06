import assert from "node:assert/strict";
import test from "node:test";
import { derivePressTransitionPayload } from "./transitionPayload";

const attempt = { articleId: "article-1", rawText: "메모 20곳", tone: "formal" as const, reviewInstruction: "검토", rewriteInstruction: "수정", selectedNoteIds: ["n1"] };
test("derivation ignores browser fields and validates target schema", () => {
  assert.deepEqual(derivePressTransitionPayload({ edgeId: "initialization-brief", sourceOutput: { articleId: "article-1", injected: "no" }, attemptInput: attempt }), { articleId: "article-1", rawText: "메모 20곳", tone: "formal" });
  const review = derivePressTransitionPayload({ edgeId: "review-rewrite", sourceOutput: { notes: [{ id: "n1" }, { id: "n2" }] }, attemptInput: attempt, selections: { selectedNoteIds: ["n1", "n1"], rewriteInstruction: "수정" } });
  assert.deepEqual(review.selectedNoteIds, ["n1"]);
  assert.equal(review.userInstruction, "수정");
});

test("malformed source output fails closed", () => assert.throws(() => derivePressTransitionPayload({ edgeId: "draft-review", sourceOutput: {}, attemptInput: attempt })));
