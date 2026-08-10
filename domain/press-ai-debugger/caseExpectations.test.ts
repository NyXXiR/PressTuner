import assert from "node:assert/strict";
import test from "node:test";

import {
  customExpectationFingerprint,
  deriveExpectationValidation,
  normalizeCustomExpectations,
} from "./caseExpectations";

test("normalizes legacy expectations as global transition text matchers", () => {
  assert.deepEqual(normalizeCustomExpectations([
    { id: "a", field: "contains", value: "문구" },
    { id: "b", field: "notContains", value: "금지", verdict: "BLOCK" },
  ]), [
    { id: "a", matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "문구" }, verdict: "WARN" },
    { id: "b", matcher: { version: 1, subject: "transition_text", operator: "not_contains", operand: "금지" }, verdict: "BLOCK" },
  ]);
});

test("accepts every allowlisted typed matcher family", () => {
  const textSubjects = ["transition_text", "source_input_text", "source_output_text", "target_payload_text"];
  const collectionSubjects = ["source_output_review_notes", "target_payload_selected_note_ids"];
  const numberSubjects = ["source_output_review_note_count", "target_payload_selected_note_count"];
  const combinations = [
    ...textSubjects.flatMap((subject) => ["contains", "not_contains", "equals", "exists", "not_empty"].map((operator) => [subject, operator, ["exists", "not_empty"].includes(operator) ? undefined : "x"])),
    ...collectionSubjects.flatMap((subject) => ["equals", "exists", "not_empty", "count_gte", "count_lte"].map((operator) => [subject, operator, ["exists", "not_empty"].includes(operator) ? undefined : 1])),
    ...numberSubjects.flatMap((subject) => ["equals", "exists", "number_eq", "number_gte", "number_lte"].map((operator) => [subject, operator, operator === "exists" ? undefined : 1])),
  ];
  const rows = combinations.map(([subject, operator, operand], index) => ({ id: `r${index}`, edgeId: "review-rewrite", matcher: { version: 1, subject, operator, ...(operand === undefined ? {} : { operand }) }, verdict: "WARN" }));
  assert.equal(normalizeCustomExpectations(rows).length, rows.length);
});

test("rejects executable, unknown, malformed, and duplicate rules", () => {
  const invalid = [
    { id: "a", jsonPath: "$.secret", matcher: { version: 1, subject: "transition_text", operator: "exists" }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "transition_text", operator: "regex", operand: ".*" }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "unknown", operator: "exists" }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "transition_text", operator: "exists", operand: "extra" }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "source_output_review_note_count", operator: "number_eq", operand: Number.POSITIVE_INFINITY }, verdict: "WARN" },
    { id: "a", edgeId: "unknown-edge", matcher: { version: 1, subject: "transition_text", operator: "exists" }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "transition_text", operator: "number_gte", operand: 1 }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "x", executable: "return true" }, verdict: "WARN" },
    { id: "a", matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "x", predicate: { jsonPath: "$.title" } }, verdict: "WARN" },
  ];
  for (const value of invalid) assert.throws(() => normalizeCustomExpectations([value]));
  assert.throws(() => normalizeCustomExpectations([{ id: "same", field: "contains", value: "a" }, { id: "same", field: "contains", value: "b" }]));
  assert.throws(() => normalizeCustomExpectations(Array.from({ length: 51 }, (_, index) => ({ id: `rule-${index}`, field: "contains", value: "x" }))));
});

test("edge-less scope remains global while an explicit edge is preserved", () => {
  const [global, scoped] = normalizeCustomExpectations([
    { id: "global", matcher: { version: 1, subject: "transition_text", operator: "exists" }, verdict: "WARN" },
    { id: "scoped", edgeId: "draft-review", matcher: { version: 1, subject: "transition_text", operator: "exists" }, verdict: "BLOCK" },
  ]);
  assert.equal(global?.edgeId, undefined);
  assert.equal(scoped?.edgeId, "draft-review");
});

test("fingerprints are canonical and exclude display identity", () => {
  const [a] = normalizeCustomExpectations([{ id: "first", edgeId: "brief-draft", verdict: "BLOCK", matcher: { operator: "contains", operand: "x", subject: "source_output_text", version: 1 } }]);
  const [b] = normalizeCustomExpectations([{ verdict: "BLOCK", matcher: { version: 1, subject: "source_output_text", operator: "contains", operand: "x" }, edgeId: "brief-draft", id: "renamed" }]);
  assert.equal(customExpectationFingerprint(a), customExpectationFingerprint(b));
  for (const changed of [
    { ...a, edgeId: "draft-review" },
    { ...a, matcher: { ...a.matcher, subject: "target_payload_text" as const } },
    { ...a, matcher: { ...a.matcher, operator: "equals" as const } },
    { ...a, matcher: { ...a.matcher, operand: "y" } },
    { ...a, verdict: "WARN" as const },
  ]) assert.notEqual(customExpectationFingerprint(a), customExpectationFingerprint(changed));
});

test("derives chronological proof state for the current fingerprint only", () => {
  const states = (verdicts: Array<"PASS" | "WARN" | "BLOCK">) => deriveExpectationValidation("fp", verdicts.map((verdict, index) => ({ origin: "CASE_EXPECTATION" as const, verdict, evidence: { ruleFingerprint: "fp" }, createdAt: new Date(index).toISOString() })));
  assert.equal(states([]).state, "UNTESTED");
  assert.equal(states(["PASS"]).state, "UNPROVEN");
  assert.equal(states(["WARN"]).state, "DETECTED");
  assert.equal(states(["BLOCK"]).state, "DETECTED");
  assert.equal(states(["WARN", "PASS"]).state, "VERIFIED");
  assert.equal(states(["BLOCK", "PASS"]).state, "VERIFIED");
  assert.equal(states(["PASS", "WARN"]).state, "DETECTED");
  assert.equal(states(["WARN", "PASS", "WARN"]).state, "DETECTED");
  assert.equal(deriveExpectationValidation("fp", [{ origin: "MANDATORY", verdict: "BLOCK", evidence: { ruleFingerprint: "fp" }, createdAt: "2026-01-01" }, { origin: "CASE_EXPECTATION", verdict: "WARN", evidence: { ruleFingerprint: "old" }, createdAt: "2026-01-02" }]).state, "UNTESTED");
});
