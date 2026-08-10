import assert from "node:assert/strict";
import test from "node:test";
import {
  addCaseExpectation,
  compatibleMatcherOperators,
  createCaseExpectationRow,
  deleteCaseExpectation,
  expectationValidationForDraft,
  isCaseEditorFormValid,
  matcherNeedsOperand,
  orderExpectationsForEdge,
  sameExpectationDefinition,
  scopeLabel,
  updateCaseExpectation,
} from "./pressAiCaseEditorModel";

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

test("CRUD transformations preserve stable rule IDs and default additions to the selected edge", () => {
  const original = createCaseExpectationRow("brief-draft", () => "rule-1");
  const added = addCaseExpectation([original], "draft-review", () => "rule-2");
  assert.deepEqual(added.map((item) => [item.id, item.edgeId]), [["rule-1", "brief-draft"], ["rule-2", "draft-review"]]);
  const edited = updateCaseExpectation(added, "rule-1", { ...original, edgeId: undefined, verdict: "BLOCK" });
  assert.equal(edited[0]?.id, "rule-1");
  assert.equal(edited[0]?.edgeId, undefined);
  assert.equal(edited[0]?.verdict, "BLOCK");
  assert.deepEqual(deleteCaseExpectation(edited, "rule-2").map((item) => item.id), ["rule-1"]);
});

test("selected-edge rules sort before global and unrelated rules with explicit scope labels", () => {
  const rows = [
    { ...createCaseExpectationRow("brief-draft", () => "other") },
    { ...createCaseExpectationRow("draft-review", () => "selected") },
    { ...createCaseExpectationRow("draft-review", () => "global"), edgeId: undefined },
  ];
  assert.deepEqual(orderExpectationsForEdge(rows, "draft-review").map((item) => item.id), ["selected", "global", "other"]);
  assert.equal(scopeLabel(undefined), "모든 전이에 적용 (레거시/전역 계약)");
  assert.match(scopeLabel("brief-draft"), /메모 정규화 → 초안 생성/);
});

test("edited definitions reset displayed validation until saved", () => {
  const draft = createCaseExpectationRow("draft-review", () => "stable");
  const stored = { ...draft, fingerprint: "fp", validation: { state: "VERIFIED" as const, lastVerdict: "PASS" as const, lastObservationAt: "2026-08-10T00:00:00.000Z" } };
  assert.equal(expectationValidationForDraft(draft, stored).state, "VERIFIED");
  assert.deepEqual(expectationValidationForDraft({ ...draft, verdict: "BLOCK" }, stored), { state: "UNTESTED", lastVerdict: null, lastObservationAt: null });
});

test("form validity rejects incomplete, duplicate, unknown-edge, incompatible and oversized rules", () => {
  const valid = createCaseExpectationRow("draft-review", () => "rule-1");
  const filled = { ...valid, matcher: { ...valid.matcher, operand: "title" } };
  const args = { checkpointId: "cp-1", name: "case", expectations: [filled] };
  assert.equal(isCaseEditorFormValid(args), true);
  assert.equal(isCaseEditorFormValid({ ...args, expectations: [valid] }), false);
  assert.equal(isCaseEditorFormValid({ ...args, expectations: [filled, { ...filled }] }), false);
  assert.equal(isCaseEditorFormValid({ ...args, expectations: [{ ...filled, edgeId: "unknown" }] }), false);
  assert.equal(isCaseEditorFormValid({ ...args, expectations: [{ ...filled, matcher: { version: 1, subject: "transition_text", operator: "number_gte", operand: 1 } }] }), false);
  assert.equal(isCaseEditorFormValid({ ...args, expectations: Array.from({ length: 51 }, (_, index) => ({ ...filled, id: `rule-${index}` })) }), false);
});
