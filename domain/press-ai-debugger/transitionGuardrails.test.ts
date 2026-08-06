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
