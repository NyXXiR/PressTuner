import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePressTransitionGuardrails, rollUpGuardrailVerdict } from "./transitionGuardrails";

test("mandatory observations are complete and expectations append deterministically", () => {
  const result = evaluatePressTransitionGuardrails({ edgeId: "initialization-brief", sourceInput: {}, sourceOutput: { articleId: "a" }, targetPayload: {}, attempt: { teamId: "t", articleId: "a" }, article: { id: "a", teamId: "t", type: "PRESS_RELEASE" }, expectations: [{ id: "z", field: "contains", value: "never" }, { id: "a", field: "notContains", value: "never" }] });
  assert.deepEqual(result.observations.slice(-2).map((item) => item.guardrailId), ["a", "z"]);
  for (const item of result.observations) { assert.ok(item.expected); assert.ok(item.observed); assert.ok(item.reason); assert.ok("evidence" in item); }
  assert.equal(result.observations[0].origin, "MANDATORY");
});
test("roll-up uses BLOCK then WARN priority", () => { assert.equal(rollUpGuardrailVerdict([{ verdict: "PASS" }, { verdict: "WARN" }]), "WARN"); assert.equal(rollUpGuardrailVerdict([{ verdict: "WARN" }, { verdict: "BLOCK" }]), "BLOCK"); });
test("an empty review note candidate is recorded as a blocked transition", () => {
  const result = evaluatePressTransitionGuardrails({
    edgeId: "review-rewrite",
    sourceInput: {},
    sourceOutput: { notes: [] },
    targetPayload: { articleId: "a", selectedNoteIds: [], userInstruction: "수정" },
    attempt: { teamId: "t", articleId: "a" },
  });
  assert.equal(result.verdict, "BLOCK");
  assert.equal(result.observations.find((item) => item.guardrailId === "review-note-selection")?.observed, "none");
});
test("grounding excludes tone, quota, timestamps, URLs, paths and retrieval metadata", () => {
  const metadata = ["918273", "2099-12-31", "metadata.invalid", "778899", "/api/private", "665544", "0.123456", "formal"];
  const result = evaluatePressTransitionGuardrails({ edgeId: "draft-review", sourceInput: { oneLiner: "반드시 30% 이상 개선한다.", eventAt: "2026-08-20", tone: "formal", usage: { quota: 918273 }, createdAt: "2099-12-31T00:00:00Z", url: "https://metadata.invalid/778899", path: "/api/private/665544", retrievalScore: 0.123456 }, sourceOutput: { title: "성과", plain: "반드시 30% 이상 개선한다. 일정은 2026-08-20이다." }, targetPayload: { title: "성과", plain: "본문" }, attempt: { teamId: "t", articleId: "a" } });
  const serialized = JSON.stringify(result.observations); for (const token of metadata) assert.doesNotMatch(serialized, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
test("typed custom rules are edge scoped and carry fingerprints", () => {
  const expectation = { id: "typed", edgeId: "draft-review", matcher: { version: 1 as const, subject: "source_output_text" as const, operator: "contains" as const, operand: "성과" }, verdict: "BLOCK" as const };
  const common = { sourceInput: {}, sourceOutput: { title: "성과", plain: "본문" }, targetPayload: { plain: "본문" }, attempt: { teamId: "t", articleId: "a" } };
  assert.equal(evaluatePressTransitionGuardrails({ ...common, edgeId: "brief-draft", expectations: [expectation] }).observations.some((item) => item.guardrailId === "typed"), false);
  const result = evaluatePressTransitionGuardrails({ ...common, edgeId: "draft-review", expectations: [expectation] });
  const custom = result.observations.find((item) => item.guardrailId === "typed");
  assert.equal(custom?.verdict, "PASS");
  assert.match(String((custom?.evidence as { ruleFingerprint: string }).ruleFingerprint), /^[a-f0-9]{64}$/);
});

test("legacy global rules run on every edge and invalid stored data is ignored", () => {
  const expectations = [{ id: "legacy", field: "notContains", value: "secret" } as const, { id: "bad", field: "contains", value: "" } as never];
  for (const edgeId of ["initialization-brief", "draft-review"]) {
    const result = evaluatePressTransitionGuardrails({ edgeId, sourceInput: {}, sourceOutput: {}, targetPayload: {}, attempt: { teamId: "t", articleId: "a" }, expectations });
    assert.equal(result.observations.some((item) => item.guardrailId === "legacy"), true);
    assert.equal(result.observations.some((item) => item.guardrailId === "bad"), false);
  }
});

test("a custom rule sharing a mandatory ID cannot suppress or replace the mandatory observation", () => {
  const result = evaluatePressTransitionGuardrails({
    edgeId: "initialization-brief",
    sourceInput: {},
    sourceOutput: { articleId: "a" },
    targetPayload: {},
    attempt: { teamId: "t", articleId: "a" },
    article: { id: "a", teamId: "t", type: "PRESS_RELEASE" },
    expectations: [{ id: "article-team-ownership", matcher: { version: 1, subject: "transition_text", operator: "exists" }, verdict: "BLOCK" }],
  });
  const collisions = result.observations.filter((item) => item.guardrailId === "article-team-ownership");
  assert.deepEqual(collisions.map((item) => item.origin), ["MANDATORY", "CASE_EXPECTATION"]);
  assert.ok(result.observations.findIndex((item) => item.origin === "MANDATORY") < result.observations.findIndex((item) => item.origin === "CASE_EXPECTATION"));
});

test("custom evidence fingerprints definitions without leaking the raw operand", () => {
  const secretOperand = "private-operand-918273";
  const result = evaluatePressTransitionGuardrails({
    edgeId: "draft-review",
    sourceInput: {},
    sourceOutput: { title: "safe", plain: "copy" },
    targetPayload: {},
    attempt: { teamId: "t", articleId: "a" },
    expectations: [{ id: "redacted", edgeId: "draft-review", matcher: { version: 1, subject: "source_output_text", operator: "contains", operand: secretOperand }, verdict: "WARN" }],
  });
  const evidence = result.observations.find((item) => item.guardrailId === "redacted")?.evidence;
  assert.match(JSON.stringify(evidence), /ruleFingerprint/);
  assert.match(JSON.stringify(evidence), /operandHash/);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(secretOperand));
});

test("all matcher-v1 operators evaluate deterministic typed subjects", () => {
  const definitions = [
    ["source_output_text", "contains", "Alpha"], ["target_payload_text", "not_contains", "secret"], ["source_input_text", "equals", "input"], ["target_payload_text", "exists"], ["transition_text", "not_empty"],
    ["source_output_review_notes", "equals", 2], ["source_output_review_notes", "exists"], ["source_output_review_notes", "not_empty"], ["source_output_review_notes", "count_gte", 2], ["source_output_review_notes", "count_lte", 2],
    ["source_output_review_note_count", "equals", 2], ["source_output_review_note_count", "exists"], ["source_output_review_note_count", "number_eq", 2], ["source_output_review_note_count", "number_gte", 2], ["source_output_review_note_count", "number_lte", 2],
  ] as const;
  const expectations = definitions.map(([subject, operator, operand], index) => ({ id: `operator-${index}`, edgeId: "draft-review", matcher: { version: 1 as const, subject, operator, ...(operand === undefined ? {} : { operand }) }, verdict: "BLOCK" as const }));
  const result = evaluatePressTransitionGuardrails({ edgeId: "draft-review", sourceInput: { rawText: "input" }, sourceOutput: { title: "Alpha", plain: "Beta", notes: [{ id: "n1" }, { id: "n2" }] }, targetPayload: { plain: "Gamma", selectedNoteIds: ["n1", "n2"] }, attempt: { teamId: "t", articleId: "a" }, expectations });
  assert.deepEqual(result.observations.filter((item) => item.origin === "CASE_EXPECTATION").map((item) => item.verdict), expectations.map(() => "PASS"));
});
