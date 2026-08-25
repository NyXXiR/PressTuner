import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinalOutputQuality, transitionRequirementReasonCodes } from "./checkpointFactHooks";

test("final output quality is independent from technical execution completion", () => {
  assert.deepEqual(evaluateFinalOutputQuality({ title: "완성 제목", plain: "완성 본문" }), { verdict: "PASS", reasonCodes: [] });
  assert.deepEqual(evaluateFinalOutputQuality({ title: "", plain: "완성 본문" }), { verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] });
  assert.deepEqual(evaluateFinalOutputQuality(null), { verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] });
});

test("transition requirement reasons are closed codes without observed fact text", () => {
  assert.deepEqual(transitionRequirementReasonCodes({ guardrailId: "memo-brief-grounding", verdict: "WARN", origin: "MANDATORY" }), ["FACT_MISSING"]);
  assert.deepEqual(transitionRequirementReasonCodes({ guardrailId: "critical-fact-preservation", verdict: "WARN", origin: "MANDATORY" }), ["FACT_MISSING"]);
  assert.deepEqual(transitionRequirementReasonCodes({ guardrailId: "critical-fact-preservation", verdict: "BLOCK", origin: "MANDATORY" }), ["ALL_AUTHORED_FACTS_MISSING"]);
  assert.deepEqual(transitionRequirementReasonCodes({ guardrailId: "private-case", verdict: "BLOCK", origin: "CASE_EXPECTATION" }), ["CASE_EXPECTATION_FAILED"]);
});
