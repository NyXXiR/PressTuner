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
test("grounding excludes tone, quota, timestamps, URLs, paths and retrieval metadata", () => {
  const metadata = ["918273", "2099-12-31", "metadata.invalid", "778899", "/api/private", "665544", "0.123456", "formal"];
  const result = evaluatePressTransitionGuardrails({ edgeId: "draft-review", sourceInput: { oneLiner: "반드시 30% 이상 개선한다.", eventAt: "2026-08-20", tone: "formal", usage: { quota: 918273 }, createdAt: "2099-12-31T00:00:00Z", url: "https://metadata.invalid/778899", path: "/api/private/665544", retrievalScore: 0.123456 }, sourceOutput: { title: "성과", plain: "반드시 30% 이상 개선한다. 일정은 2026-08-20이다." }, targetPayload: { title: "성과", plain: "본문" }, attempt: { teamId: "t", articleId: "a" } });
  const serialized = JSON.stringify(result.observations); for (const token of metadata) assert.doesNotMatch(serialized, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
