import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQuickFillExtraction } from "./quickFill";

const sections = [
  { id: "projects", title: "경력 상세", kind: "items" as const },
  { id: "summary", title: "소개", kind: "narrative" as const },
];

test("quick fill keeps only selected, kind-compatible, source-grounded suggestions", () => {
  const sourceText = "결제 정산 배치를 멱등 구조로 바꿔 재실행 오류를 줄였다. 장애 대응 절차도 문서화했다.";
  const result = normalizeQuickFillExtraction({ candidates: [
    {
      targetSectionId: "projects",
      confidence: 0.92,
      warnings: [],
      evidenceExcerpt: "결제 정산 배치를 멱등 구조로 바꿔 재실행 오류를 줄였다.",
      payload: { type: "item", itemKind: "career-detail", detailType: "improvement", title: "정산 배치 안정화", subtitle: "", body: "멱등 구조를 적용해 재실행 오류를 줄였습니다.", isCurrent: false, tags: [] },
    },
    {
      targetSectionId: "summary",
      confidence: 0.8,
      warnings: [],
      evidenceExcerpt: "장애 대응 절차도 문서화했다.",
      payload: { type: "narrative", body: "장애 대응 절차를 문서화하는 엔지니어입니다." },
    },
    {
      targetSectionId: "summary",
      confidence: 0.8,
      warnings: [],
      evidenceExcerpt: "장애 대응 절차도 문서화했다.",
      payload: { type: "tags", values: ["문서화"] },
    },
    {
      targetSectionId: "credentials",
      confidence: 0.8,
      warnings: [],
      evidenceExcerpt: "장애 대응 절차도 문서화했다.",
      payload: { type: "item", itemKind: "credential", title: "없는 자격", subtitle: "", body: "", isCurrent: false, tags: [] },
    },
    {
      targetSectionId: "projects",
      confidence: 0.8,
      warnings: [],
      evidenceExcerpt: "매출을 30% 높였다.",
      payload: { type: "item", itemKind: "career-detail", detailType: "improvement", title: "근거 없는 성과", subtitle: "", body: "매출을 높였습니다.", isCurrent: false, tags: [] },
    },
  ] }, sourceText, sections);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.targetSectionId), ["projects", "summary"]);
  assert.deepEqual(result.map((item) => item.applyMode), ["APPEND", "MERGE"]);
  assert.deepEqual(result.map((item) => item.kind), ["ITEM", "NARRATIVE"]);
});

test("quick fill deduplicates identical payloads and requires meaningful evidence excerpts", () => {
  const candidate = {
    targetSectionId: "summary",
    confidence: 2,
    warnings: ["표현을 다듬음"],
    evidenceExcerpt: "운영 자동화를 담당했다",
    payload: { type: "narrative", body: "운영 자동화를 담당했습니다." },
  };
  const result = normalizeQuickFillExtraction(
    { candidates: [candidate, candidate, { ...candidate, evidenceExcerpt: "함" }] },
    "운영 자동화를 담당했다.",
    sections,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.confidence, 1);
  assert.deepEqual(result[0]?.warnings, ["표현을 다듬음"]);
});
