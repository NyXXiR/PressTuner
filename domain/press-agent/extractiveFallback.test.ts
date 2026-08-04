import assert from "node:assert/strict";
import test from "node:test";

import { buildExtractiveVerificationFallback } from "./extractiveFallback";
import { verifyAgentAnswerClaimSpans } from "./claimSpanVerification";

const sources = [
  { sourceId: "s1", documentId: "d1", content: "PT-CAREER-001 성과는 12.5% 개선이다.", pageStart: 1, pageEnd: 1 },
  { sourceId: "s2", documentId: "d2", content: "PT-CAREER-002 성과는 20건 처리이다.", pageStart: 1, pageEnd: 1 },
];

test("builds an exact, verifier-passing fallback only when every requested identifier exists", () => {
  const output = buildExtractiveVerificationFallback({ prompt: "PT-CAREER-001과 PT-CAREER-002 비교", sources });
  assert.ok(output);
  assert.equal(verifyAgentAnswerClaimSpans({ ...output, sources }).status, "PASS");
  assert.deepEqual(output.sourceIds, ["s1", "s2"]);
});

test("refuses an extractive fallback when retrieval substituted another document", () => {
  assert.equal(buildExtractiveVerificationFallback({ prompt: "CE-PDFKIT-003 알려줘", sources: [
    { sourceId: "s3", documentId: "d3", content: "CE-PDFKIT-002 제품 사실", pageStart: 1, pageEnd: 1 },
  ] }), null);
});
