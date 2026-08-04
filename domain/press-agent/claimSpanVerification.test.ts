import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyAgentAnswerClaimSpans,
  verifyDraftClaimSpans,
  type DraftClaimInput,
  type VerifiableSource,
} from "./claimSpanVerification";

const sources: VerifiableSource[] = [
  {
    sourceId: "s1",
    documentId: "doc-a",
    content:
      "감사된 결산 자료에 따르면 2026년 매출은 100억원이며 전년 대비 12.5% 증가했습니다.",
    pageStart: 3,
    pageEnd: 3,
  },
  {
    sourceId: "s2",
    documentId: "doc-b",
    content: "신제품 알파는 2026년 9월 서울에서 정식 출시됩니다.",
    pageStart: 7,
    pageEnd: 7,
  },
];

function claim(
  text: string,
  evidence: DraftClaimInput["evidence"],
  id = "c1",
): DraftClaimInput {
  return { id, text, evidence };
}

test("a known source ID with a fabricated quote is not grounded", () => {
  const result = verifyDraftClaimSpans({
    draft: { title: "실적 발표", body: "2026년 매출은 100억원입니다." },
    claims: [
      claim("실적 발표", [
        { sourceId: "s1", quote: "감사된 결산 자료" },
      ], "title"),
      claim("2026년 매출은 100억원입니다.", [
        { sourceId: "s1", quote: "2026년 매출은 999억원" },
      ]),
    ],
    sources,
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.invalidCitations, [
    {
      claimId: "c1",
      sourceId: "s1",
      reason: "QUOTE_NOT_FOUND",
    },
  ]);
  assert.ok(result.unsupportedClaimIds.includes("c1"));
});

test("citation membership alone cannot support an unrelated claim", () => {
  const result = verifyDraftClaimSpans({
    draft: { title: "실적 발표", body: "2026년 매출은 100억원입니다." },
    claims: [
      claim("실적 발표", [
        { sourceId: "s1", quote: "감사된 결산 자료" },
      ], "title"),
      claim("2026년 매출은 100억원입니다.", [
        { sourceId: "s1", quote: "전년 대비 12.5% 증가했습니다" },
      ]),
    ],
    sources,
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.claims[1]?.missingClaimTokens, ["2026", "매출", "100억원"]);
});

test("every title/body sentence must be represented by an atomic claim", () => {
  const result = verifyDraftClaimSpans({
    draft: {
      title: "알파 출시",
      body: "알파는 2026년 9월 출시됩니다. 출시 장소는 서울입니다.",
    },
    claims: [
      claim("알파 출시", [{ sourceId: "s2", quote: "신제품 알파" }], "title"),
      claim(
        "알파는 2026년 9월 출시됩니다.",
        [{ sourceId: "s2", quote: "알파는 2026년 9월 서울에서 정식 출시됩니다" }],
        "launch",
      ),
    ],
    sources,
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.uncoveredDraftSentences, ["출시 장소는 서울입니다."]);
});

test("numeric formatting boundaries normalize commas and percentages", () => {
  const numericSource: VerifiableSource = {
    sourceId: "s3",
    documentId: "doc-c",
    content: "누적 사용자는 1,200명이고 전환율은 12.5%입니다.",
    pageStart: 2,
    pageEnd: 2,
  };
  const result = verifyDraftClaimSpans({
    draft: {
      title: "성과 공개",
      body: "누적 사용자는 1200명이며 전환율은 12.5%입니다.",
    },
    claims: [
      claim("성과 공개", [{ sourceId: "s3", quote: "누적 사용자는" }], "title"),
      claim(
        "누적 사용자는 1200명이며 전환율은 12.5%입니다.",
        [
          {
            sourceId: "s3",
            quote: "누적 사용자는 1,200명이고 전환율은 12.5%입니다",
          },
        ],
      ),
    ],
    sources: [numericSource],
  });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.claims[1]?.spans, [
    {
      sourceId: "s3",
      pageStart: 2,
      pageEnd: 2,
      start: 0,
      end: 30,
      quote: "누적 사용자는 1,200명이고 전환율은 12.5%입니다",
    },
  ]);
});

test("multi-source composite claims may cover required tokens across exact spans", () => {
  const result = verifyDraftClaimSpans({
    draft: {
      title: "알파 성장 발표",
      body: "알파는 서울에서 출시되며 매출은 100억원입니다.",
    },
    claims: [
      claim("알파 성장 발표", [
        { sourceId: "s2", quote: "신제품 알파" },
      ], "title"),
      claim("알파는 서울에서 출시되며 매출은 100억원입니다.", [
        { sourceId: "s2", quote: "알파는 2026년 9월 서울에서 정식 출시됩니다" },
        { sourceId: "s1", quote: "2026년 매출은 100억원" },
      ]),
    ],
    sources,
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.claims[1]?.spans.length, 2);
});

test("conflicting numeric evidence in a cited composite claim fails verification", () => {
  const result = verifyDraftClaimSpans({
    draft: { title: "실적 발표", body: "2026년 매출은 100억원입니다." },
    claims: [
      claim("실적 발표", [
        { sourceId: "s1", quote: "감사된 결산 자료" },
      ], "title"),
      claim("2026년 매출은 100억원입니다.", [
        { sourceId: "s1", quote: "2026년 매출은 100억원" },
        { sourceId: "s4", quote: "2026년 매출은 120억원" },
      ]),
    ],
    sources: [
      ...sources,
      {
        sourceId: "s4",
        documentId: "doc-d",
        content: "다른 보고서에는 2026년 매출은 120억원으로 기록됐습니다.",
        pageStart: 4,
        pageEnd: 4,
      },
    ],
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.claims[1]?.reasonCodes, ["CONTRADICTORY_NUMERIC_EVIDENCE"]);
});

test("ordinary factual Agent answers use the same exact quote verifier", () => {
  const result = verifyAgentAnswerClaimSpans({
    answer: "2026년 매출은 100억원입니다.",
    cannotAnswer: false,
    claims: [
      claim("2026년 매출은 100억원입니다.", [
        { sourceId: "s1", quote: "2026년 매출은 100억원" },
      ]),
    ],
    sources,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.mode, "ANSWER");
});

test("ordinary answers without claims and abstentions with claims fail closed", () => {
  assert.throws(
    () => verifyAgentAnswerClaimSpans({ answer: "사실", cannotAnswer: false, claims: [], sources }),
    /PRESS_AGENT_FACTUAL_CLAIMS_REQUIRED/,
  );
  assert.throws(
    () => verifyAgentAnswerClaimSpans({
      answer: "답할 수 없습니다.",
      cannotAnswer: true,
      claims: [claim("사실", [{ sourceId: "s1", quote: "감사된 결산 자료" }])],
      sources,
    }),
    /PRESS_AGENT_ABSTENTION_CLAIMS_NOT_ALLOWED/,
  );
});
