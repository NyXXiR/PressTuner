import assert from "node:assert/strict";
import test from "node:test";
import { compatibleMatcherOperators, createCaseExpectationRow, matcherNeedsOperand, sameExpectationDefinition } from "./pressAiCaseEditorModel";

test("editor creates stable typed rows and restricts operators by subject", () => {
  const row = createCaseExpectationRow("brief-draft", () => "stable-id");
  assert.equal(row.id, "stable-id");
  assert.equal(row.edgeId, "brief-draft");
  assert.deepEqual(compatibleMatcherOperators("source_output_review_notes"), ["equals", "exists", "not_empty", "count_gte", "count_lte"]);
  assert.deepEqual(compatibleMatcherOperators("source_output_review_note_count"), ["equals", "exists", "number_eq", "number_gte", "number_lte"]);
  assert.equal(matcherNeedsOperand("exists"), false);
  assert.equal(matcherNeedsOperand("contains"), true);
  assert.equal(sameExpectationDefinition(row, { ...row }), true);
  assert.equal(sameExpectationDefinition(row, { ...row, edgeId: "draft-review" }), false);
});
