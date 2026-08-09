import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePressTransitionGuardrails, rollUpGuardrailVerdict } from "./transitionGuardrails";

test("mandatory observations are complete and expectations append deterministically", () => {
  const result = evaluatePressTransitionGuardrails({ edgeId: "initialization-brief", sourceInput: {}, sourceOutput: { articleId: "a" }, targetPayload: {}, attempt: { teamId: "t", articleId: "a" }, article: { id: "a", teamId: "t", type: "PRESS_RELEASE" }, expectations: [{ id: "z", field: "contains", value: "never" }, { id: "a", field: "notContains", value: "never" }] });
  assert.deepEqual(result.observations.slice(-2).map((item) => item.guardrailId), ["a", "z"]);
  for (const item of result.observations) { assert.ok(item.expected); assert.ok(item.observed); assert.ok(item.reason); assert.ok("evidence" in item); }
  assert.equal(result.observations[0].origin, "MANDATORY");
});
test("roll-up fails closed on NOT_EVALUABLE before BLOCK and WARN", () => { assert.equal(rollUpGuardrailVerdict([{ verdict: "PASS" }, { verdict: "WARN" }]), "WARN"); assert.equal(rollUpGuardrailVerdict([{ verdict: "WARN" }, { verdict: "BLOCK" }]), "BLOCK"); assert.equal(rollUpGuardrailVerdict([{ verdict: "BLOCK" }, { verdict: "NOT_EVALUABLE" }]), "NOT_EVALUABLE"); });
test("grounding excludes tone, quota, timestamps, URLs, paths and retrieval metadata", () => {
  const metadata = ["918273", "2099-12-31", "metadata.invalid", "778899", "/api/private", "665544", "0.123456", "formal"];
  const result = evaluatePressTransitionGuardrails({ edgeId: "draft-review", sourceInput: { oneLiner: "반드시 30% 이상 개선한다.", eventAt: "2026-08-20", tone: "formal", usage: { quota: 918273 }, createdAt: "2099-12-31T00:00:00Z", url: "https://metadata.invalid/778899", path: "/api/private/665544", retrievalScore: 0.123456 }, sourceOutput: { title: "성과", plain: "반드시 30% 이상 개선한다. 일정은 2026-08-20이다." }, targetPayload: { title: "성과", plain: "본문" }, attempt: { teamId: "t", articleId: "a" } });
  const serialized = JSON.stringify(result.observations); for (const token of metadata) assert.doesNotMatch(serialized, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
test("snapshotted custom guardrails fail closed until semantic evaluation completes", () => {
  const result = evaluatePressTransitionGuardrails({ edgeId: "rewrite-review", sourceInput: {}, sourceOutput: { title: "제목", plain: "본문" }, targetPayload: { articleId: "a", title: "제목", plain: "본문" }, attempt: { teamId: "t", articleId: "a" }, guardrails: [{ id: "custom-1", edgeId: "rewrite-review", instruction: "과장을 피한다", severity: "WARN", evaluatorId: "semantic-guardrail", evaluatorVersion: "1.0.0", displayOrder: 0 }] });
  assert.equal(result.verdict, "NOT_EVALUABLE");
  assert.equal(result.observations.at(-1)?.evaluationStatus, "NOT_EVALUABLE");
});
