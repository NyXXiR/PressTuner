import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveGuardrailVerdicts,
  PRESS_AGENT_GUARDRAIL_STAGE_IDS,
  type PressAgentGuardrailObservation,
} from "./pressAgentGuardrailSignals";

const base: PressAgentGuardrailObservation = {
  verifiableSourceCount: 3,
  finalCitationCount: 2,
  failedToolCount: 0,
  claimVerificationStatus: "PASS",
  fallbackMode: null,
  cannotAnswer: false,
};

const find = (observation: PressAgentGuardrailObservation, stageId: string, guardrailId: string) =>
  deriveGuardrailVerdicts(observation).find(
    (entry) => entry.stageId === stageId && entry.guardrailId === guardrailId,
  );

test("a clean grounded answer reports no violations", () => {
  const verdicts = deriveGuardrailVerdicts(base);

  assert.ok(verdicts.length > 0);
  assert.equal(verdicts.filter((entry) => entry.verdict === "violation").length, 0);
  for (const entry of verdicts) {
    assert.ok(PRESS_AGENT_GUARDRAIL_STAGE_IDS.includes(entry.stageId));
  }
});

test("answering with no usable evidence violates evidence use, withholding does not", () => {
  assert.equal(
    find({ ...base, verifiableSourceCount: 0 }, "retrieval-execution", "evidence-use")?.verdict,
    "violation",
  );
  assert.equal(
    find({ ...base, verifiableSourceCount: 0, cannotAnswer: true, finalCitationCount: 0 }, "retrieval-execution", "evidence-use")?.verdict,
    "not_evaluable",
  );
});

test("an answer without citations violates claim verification at the response stage", () => {
  assert.equal(
    find({ ...base, finalCitationCount: 0 }, "response-behavior", "citation-claim-verification")?.verdict,
    "violation",
  );
  // A withheld answer legitimately carries no citations.
  assert.equal(
    find({ ...base, cannotAnswer: true, finalCitationCount: 0 }, "response-behavior", "citation-claim-verification")?.verdict,
    "not_evaluable",
  );
});

test("failed verification is a violation and falling back afterwards is the guardrail working", () => {
  const failedWithFallback = { ...base, claimVerificationStatus: "FAIL" as const, fallbackMode: "EXTRACTIVE" as const };
  assert.equal(find(failedWithFallback, "verification", "citation-claim-verification")?.verdict, "violation");
  assert.equal(find(failedWithFallback, "fallback", "safe-fallback")?.verdict, "pass");

  const failedWithoutFallback = { ...base, claimVerificationStatus: "FAIL" as const, fallbackMode: null };
  assert.equal(find(failedWithoutFallback, "fallback", "safe-fallback")?.verdict, "violation");
});

test("unobserved guardrails are omitted rather than guessed", () => {
  const unknown: PressAgentGuardrailObservation = {
    verifiableSourceCount: 0,
    finalCitationCount: 0,
    failedToolCount: null,
    claimVerificationStatus: null,
    fallbackMode: null,
    cannotAnswer: null,
  };
  const verdicts = deriveGuardrailVerdicts(unknown);

  assert.equal(find(unknown, "retrieval-execution", "expected-tool-behavior"), undefined);
  assert.equal(find(unknown, "verification", "citation-claim-verification"), undefined);
  assert.equal(find(unknown, "fallback", "safe-fallback"), undefined);
  assert.equal(find(unknown, "evidence-decision", "safe-fallback"), undefined);
  // Nothing is ever reported as a pass without an observation behind it.
  assert.equal(verdicts.filter((entry) => entry.verdict === "pass").length, 0);
});

test("a failed tool call violates expected tool behavior", () => {
  assert.equal(find({ ...base, failedToolCount: 2 }, "retrieval-execution", "expected-tool-behavior")?.verdict, "violation");
  assert.equal(find(base, "retrieval-execution", "expected-tool-behavior")?.verdict, "pass");
});

test("verdicts never duplicate a stage and guardrail pair", () => {
  for (const observation of [base, { ...base, claimVerificationStatus: "FAIL" as const, fallbackMode: "ABSTENTION" as const }]) {
    const keys = deriveGuardrailVerdicts(observation).map((entry) => `${entry.stageId}:${entry.guardrailId}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});
