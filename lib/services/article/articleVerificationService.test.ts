import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleVerifierResponseFormat,
  validateVerifierFindings,
} from "./articleVerificationService";

test("verifier schema constrains cited evidence to accepted fact IDs", () => {
  const responseFormat = buildArticleVerifierResponseFormat([
    "accepted-1",
    "accepted-2",
  ]);
  const findingSchema = (
    responseFormat.json_schema.schema.properties.findings as {
      items: {
        properties: {
          type: { enum: string[] };
          evidenceFactIds: { items: { enum?: string[] } };
        };
      };
    }
  ).items;

  assert.deepEqual(
    findingSchema.properties.evidenceFactIds.items.enum,
    ["accepted-1", "accepted-2"],
  );
  assert.ok(findingSchema.properties.type.enum.includes("OMISSION"));
});

test("omission findings are normalized to WARN", () => {
  const [finding] = validateVerifierFindings(
    [
      {
        type: "OMISSION",
        riskCategory: "OTHER",
        factOrigin: "USER",
        claim: "내부 집계 방식",
        explanation: "확정 사실의 측정 기준이 원고에서 빠졌습니다.",
        evidenceFactIds: ["accepted"],
        verifierResult: "PASS",
      },
    ],
    new Set(["accepted"]),
  );
  assert.equal(finding.result, "WARN");
});

test("verifier rejects unknown evidence IDs instead of converting them to warnings", () => {
  assert.throws(
    () =>
      validateVerifierFindings(
        [
          {
            type: "CONTRADICTION",
            riskCategory: "DATE",
            factOrigin: "RAG",
            claim: "date",
            explanation: "conflict",
            evidenceFactIds: ["unknown"],
          },
        ],
        new Set(["accepted"]),
      ),
    /ARTICLE_VERIFIER_EVIDENCE_INVALID/,
  );
});

test("deterministic verifier policy blocks RAG-backed high-risk contradictions", () => {
  const [finding] = validateVerifierFindings(
    [
      {
        type: "CONTRADICTION",
        riskCategory: "DIRECT_QUOTE",
        factOrigin: "RAG",
        claim: "quote",
        explanation: "conflict",
        evidenceFactIds: ["accepted"],
      },
    ],
    new Set(["accepted"]),
  );
  assert.equal(finding.result, "BLOCK");
});
