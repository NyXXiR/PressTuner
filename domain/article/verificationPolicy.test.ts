import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_RISK_CATEGORIES,
  aggregateVerificationResult,
  classifyVerificationFinding,
  isVerificationCurrent,
} from "./verificationPolicy";

test("only RAG-backed high-risk contradictions block", () => {
  for (const riskCategory of BLOCKING_RISK_CATEGORIES) {
    assert.equal(
      classifyVerificationFinding({
        kind: "CONTRADICTION",
        riskCategory,
        factOrigin: "RAG",
        hasRagEvidence: true,
      }),
      "BLOCK",
    );
  }
  assert.equal(
    classifyVerificationFinding({
      kind: "CONTRADICTION",
      riskCategory: "OTHER",
      factOrigin: "RAG",
      hasRagEvidence: true,
      verifierResult: "WARN",
    }),
    "WARN",
  );
  assert.equal(
    classifyVerificationFinding({
      kind: "CONTRADICTION",
      riskCategory: "DATE",
      factOrigin: "USER",
      hasRagEvidence: false,
    }),
    "WARN",
  );
});

test("unsupported high-risk user facts and style violations warn", () => {
  assert.equal(
    classifyVerificationFinding({
      kind: "UNSUPPORTED",
      riskCategory: "NUMBER",
      factOrigin: "USER",
      hasRagEvidence: false,
      verifierResult: "PASS",
    }),
    "WARN",
  );
  assert.equal(
    classifyVerificationFinding({
      kind: "STYLE_POLICY",
      riskCategory: "OTHER",
      hasRagEvidence: false,
    }),
    "WARN",
  );
  assert.equal(
    classifyVerificationFinding({
      kind: "UNSUPPORTED",
      riskCategory: "OTHER",
      factOrigin: "USER",
      hasRagEvidence: false,
      verifierResult: "PASS",
    }),
    "PASS",
  );
  assert.equal(aggregateVerificationResult(["PASS", "WARN"]), "WARN");
});

test("omitted accepted facts warn without blocking finalization", () => {
  assert.equal(
    classifyVerificationFinding({
      kind: "OMISSION",
      riskCategory: "OTHER",
      factOrigin: "USER",
      hasRagEvidence: false,
      verifierResult: "PASS",
    }),
    "WARN",
  );
});

test("content, grounding, or corpus changes make verification stale", () => {
  const verification = {
    draftHash: "hash-1",
    groundingRevision: 3,
    corpusVersion: 7,
  };
  assert.equal(isVerificationCurrent(verification, verification), true);
  for (const current of [
    { ...verification, draftHash: "hash-2" },
    { ...verification, groundingRevision: 4 },
    { ...verification, corpusVersion: 8 },
  ]) {
    assert.equal(isVerificationCurrent(verification, current), false);
  }
});
