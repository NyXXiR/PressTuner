import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePressAgentRagFeedback,
  PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1,
} from "./pressAgentRagFeedbackCriteria";
import { deriveGuardrailVerdicts } from "./pressAgentGuardrailSignals";

const expectedKeys = [
  "rag.retrieval.evidence_use.v1",
  "rag.retrieval.tool_execution.v1",
  "rag.abstention.evidence_decision.v1",
  "rag.grounded_answer.citation_presence.v1",
  "rag.grounded_answer.claim_verification.v1",
  "rag.abstention.verification_fallback.v1",
] as const;

test("owns exactly the six canonical v1 criteria without duplicate runtime mappings", () => {
  assert.deepEqual(
    PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.map(({ criterionId }) => criterionId),
    expectedKeys,
  );
  assert.equal(
    new Set(PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.map(({ criterionId }) => criterionId)).size,
    PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.length,
  );
  assert.equal(
    new Set(PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.map(({ stageId, guardrailId }) => `${stageId}:${guardrailId}`)).size,
    PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.length,
  );
  for (const criterion of PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1) {
    assert.deepEqual(
      {
        criteriaVersion: criterion.criteriaVersion,
        direction: criterion.direction,
        unit: criterion.unit,
        passScore: criterion.passScore,
        violationScore: criterion.violationScore,
      },
      { criteriaVersion: 1, direction: "higher_is_better", unit: "score", passScore: 1, violationScore: 0 },
    );
  }
});

test("clean observations produce the same ordered privacy-safe feedback", () => {
  const verdicts = deriveGuardrailVerdicts({
    verifiableSourceCount: 2,
    finalCitationCount: 2,
    failedToolCount: 0,
    claimVerificationStatus: "PASS",
    fallbackMode: null,
    postFallbackVerificationStatus: null,
    cannotAnswer: false,
  });
  const expected = expectedKeys.map((key) => ({ key, score: 1, direction: "higher_is_better", unit: "score" }));
  assert.deepEqual(derivePressAgentRagFeedback(verdicts), expected);
  assert.deepEqual(derivePressAgentRagFeedback(verdicts), expected);
});

test("violations score zero while not-evaluable and unknown verdicts are omitted", () => {
  const feedback = derivePressAgentRagFeedback([
    { stageId: "retrieval-execution", guardrailId: "evidence-use", verdict: "violation" },
    { stageId: "response-behavior", guardrailId: "citation-claim-verification", verdict: "pass" },
    { stageId: "fallback", guardrailId: "safe-fallback", verdict: "not_evaluable" },
    { stageId: "untrusted", guardrailId: "made-up", verdict: "pass" },
  ]);
  assert.deepEqual(feedback, [
    { key: "rag.retrieval.evidence_use.v1", score: 0, direction: "higher_is_better", unit: "score" },
    { key: "rag.grounded_answer.citation_presence.v1", score: 1, direction: "higher_is_better", unit: "score" },
  ]);
  assert.deepEqual(Object.keys(feedback[0]!).sort(), ["direction", "key", "score", "unit"]);
});
