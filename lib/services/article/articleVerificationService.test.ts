import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutomaticVerificationFindings,
  buildArticleVerifierResponseFormat,
  selectAutomaticEvidenceAssertions,
  validateVerifierFindings,
} from "./articleVerificationService";
import { evaluateEvidenceFactConsistency } from "@/domain/article/evidenceFactConsistency";

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

test("automatic evidence findings are safe, blocking, and retain transient lineage IDs", () => {
  const evaluation = evaluateEvidenceFactConsistency({
    draftText: "2026년 매출 360억원",
    sources: [{ documentId: "document", sourceVersion: 2, chunkId: "chunk", pageStart: 4, pageEnd: 4, excerpt: "2026년 매출 200억원", content: "2026년 매출 200억원" }],
  });
  const findings = buildAutomaticVerificationFindings(evaluation);
  assert.deepEqual(findings.map(({ type, riskCategory, result, claim }) => ({ type, riskCategory, result, claim })), [{
    type: "CONTRADICTION",
    riskCategory: "NUMBER",
    result: "BLOCK",
    claim: "DRAFT_CONFLICT",
  }]);
  assert.deepEqual(findings[0]?.evidenceFactIds, [evaluation.assertions[0]?.assertionId]);
  assert.doesNotMatch(JSON.stringify(findings), /360|200억원/);
});

test("automatic verifier context includes only comparable evidence assertions", () => {
  const evaluation = evaluateEvidenceFactConsistency({
    draftText: "Project A는 2026년 매출 200억원",
    sources: [
      { documentId: "a", sourceVersion: 1, chunkId: "a", pageStart: 1, pageEnd: 1, excerpt: "Project A는 2026년 매출 200억원", content: "Project A는 2026년 매출 200억원" },
      { documentId: "b", sourceVersion: 1, chunkId: "b", pageStart: 1, pageEnd: 1, excerpt: "Project B는 2026년 매출 999억원", content: "Project B는 2026년 매출 999억원" },
    ],
  });
  assert.deepEqual(selectAutomaticEvidenceAssertions(evaluation).map((item) => item.lineage?.documentId), ["a"]);
});
