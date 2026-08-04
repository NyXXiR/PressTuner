import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EVIDENCE_POLICY,
  buildEvidenceRequirement,
  decideEvidenceSufficiency,
  type EvidenceAssertion,
  type EvidenceCandidate,
} from "./evidencePolicy";

function candidate(
  overrides: Partial<EvidenceCandidate> & Pick<EvidenceCandidate, "sourceId">,
): EvidenceCandidate {
  const { sourceId, ...rest } = overrides;
  return {
    sourceId,
    documentId: overrides.documentId ?? `doc-${sourceId}`,
    sourceVersion: overrides.sourceVersion ?? 1,
    content:
      overrides.content ??
      "검증 가능한 충분한 길이의 보도자료 사실 근거가 여기에 포함되어 있습니다.",
    fusedScore: overrides.fusedScore ?? 0.03,
    ...rest,
  };
}

const queryCases = [
  {
    query: "A안과 B안의 차이를 비교해줘",
    expected: { minimumDistinctDocuments: 2, requiresNumericSpan: false },
  },
  {
    query: "2026년 매출은 얼마인가요?",
    expected: { minimumDistinctDocuments: 1, requiresNumericSpan: true },
  },
  {
    query: "회사 소개를 요약해줘",
    expected: { minimumDistinctDocuments: 1, requiresNumericSpan: false },
  },
] as const;

for (const fixture of queryCases) {
  test(`question-specific requirement: ${fixture.query}`, () => {
    const requirement = buildEvidenceRequirement(fixture.query);
    assert.equal(
      requirement.minimumDistinctDocuments,
      fixture.expected.minimumDistinctDocuments,
    );
    assert.equal(
      requirement.requiresNumericSpan,
      fixture.expected.requiresNumericSpan,
    );
  });
}

test("empty retrieval returns a typed abstention instead of a low-confidence answer", () => {
  const result = decideEvidenceSufficiency({
    query: "회사 소개를 알려줘",
    candidates: [],
  });

  assert.equal(result.action, "ABSTAIN");
  assert.equal(result.code, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.reasonCodes, ["NO_SELECTED_EVIDENCE"]);
  assert.equal(result.policyVersion, DEFAULT_EVIDENCE_POLICY.version);
  assert.match(result.decisionInputHash, /^[a-f0-9]{64}$/);
});

test("score, evidence length, and numeric-span thresholds are explicit", () => {
  const result = decideEvidenceSufficiency({
    query: "2026년 매출은 얼마인가요?",
    candidates: [
      candidate({
        sourceId: "weak",
        content: "매출은 큽니다.",
        fusedScore: 0.001,
      }),
    ],
  });

  assert.equal(result.action, "ABSTAIN");
  assert.equal(result.code, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(result.reasonCodes, [
    "BELOW_MINIMUM_SCORE",
    "EVIDENCE_TOO_SHORT",
    "NUMERIC_SPAN_MISSING",
  ]);
});

test("comparison questions require evidence from two documents", () => {
  const result = decideEvidenceSufficiency({
    query: "기존 정책과 새 정책을 비교해줘",
    candidates: [candidate({ sourceId: "only", documentId: "doc-a" })],
  });

  assert.equal(result.action, "ABSTAIN");
  assert.ok(result.reasonCodes.includes("DOCUMENT_DIVERSITY_MISSING"));
});

test("sufficient selected evidence returns ANSWER with auditable inputs", () => {
  const result = decideEvidenceSufficiency({
    query: "2026년 매출은 얼마인가요?",
    candidates: [
      candidate({
        sourceId: "s1",
        content: "2026년 회사 매출은 감사된 결산 자료 기준 100억원으로 확정되었습니다.",
      }),
    ],
  });

  assert.equal(result.action, "ANSWER");
  assert.equal(result.code, "EVIDENCE_SUFFICIENT");
  assert.deepEqual(result.eligibleSourceIds, ["s1"]);
  assert.deepEqual(result.reasonCodes, []);
});

test("unresolved cross-document fact conflicts force compare/abstain", () => {
  const assertions: EvidenceAssertion[] = [
    {
      key: "revenue.2026",
      normalizedValue: "100억원",
      sourceId: "s1",
      documentId: "doc-a",
      sourceVersion: 2,
      verifiedSpan: "2026년 매출은 100억원",
    },
    {
      key: "revenue.2026",
      normalizedValue: "120억원",
      sourceId: "s2",
      documentId: "doc-b",
      sourceVersion: 5,
      verifiedSpan: "2026년 매출은 120억원",
    },
  ];
  const result = decideEvidenceSufficiency({
    query: "2026년 매출은 얼마인가요?",
    candidates: [
      candidate({
        sourceId: "s1",
        documentId: "doc-a",
        sourceVersion: 2,
        content: "2026년 매출은 100억원으로 결산되었습니다.",
      }),
      candidate({
        sourceId: "s2",
        documentId: "doc-b",
        sourceVersion: 5,
        content: "2026년 매출은 120억원으로 결산되었습니다.",
      }),
    ],
    assertions,
  });

  assert.equal(result.action, "COMPARE_SOURCES");
  assert.equal(result.code, "SOURCE_CONFLICT");
  assert.deepEqual(result.conflicts, [
    {
      key: "revenue.2026",
      sourceIds: ["s1", "s2"],
      values: ["100억원", "120억원"],
      resolution: "UNRESOLVED_CROSS_DOCUMENT",
    },
  ]);
});

test("newer active source version deterministically resolves same-document conflicts", () => {
  const result = decideEvidenceSufficiency({
    query: "2026년 매출은 얼마인가요?",
    candidates: [
      candidate({
        sourceId: "old",
        documentId: "doc-a",
        sourceVersion: 1,
        content: "이전 자료에서 2026년 매출은 90억원으로 예상했습니다.",
      }),
      candidate({
        sourceId: "new",
        documentId: "doc-a",
        sourceVersion: 2,
        content: "현재 자료에서 2026년 매출은 100억원으로 확정했습니다.",
      }),
    ],
    assertions: [
      {
        key: "revenue.2026",
        normalizedValue: "90억원",
        sourceId: "old",
        documentId: "doc-a",
        sourceVersion: 1,
        verifiedSpan: "2026년 매출은 90억원",
      },
      {
        key: "revenue.2026",
        normalizedValue: "100억원",
        sourceId: "new",
        documentId: "doc-a",
        sourceVersion: 2,
        verifiedSpan: "2026년 매출은 100억원",
      },
    ],
  });

  assert.equal(result.action, "ANSWER");
  assert.deepEqual(result.eligibleSourceIds, ["new"]);
  assert.deepEqual(result.conflicts, [
    {
      key: "revenue.2026",
      sourceIds: ["old", "new"],
      values: ["90억원", "100억원"],
      resolution: "NEWEST_SAME_DOCUMENT",
      winningSourceId: "new",
    },
  ]);
});
