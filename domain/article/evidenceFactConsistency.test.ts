import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateEvidenceFactConsistency,
  normalizeKrwDecimal,
  parseEvidenceAssertions,
} from "./evidenceFactConsistency";

const source = (content: string, documentId = "document-a") => ({
  documentId,
  sourceVersion: 1,
  chunkId: `${documentId}-chunk`,
  pageStart: 1,
  pageEnd: 1,
  excerpt: content,
  content,
});

test("blocks a draft whose comparable revenue value conflicts with evidence", () => {
  const result = evaluateEvidenceFactConsistency({
    draftText: "2026년 매출 360억원",
    sources: [source("2026년 매출 200억원")],
  });
  assert.equal(result.verdict, "BLOCK");
  assert.deepEqual(result.details.counts, {
    checked: 1,
    matched: 0,
    draftConflict: 1,
    sourceConflict: 0,
    notEvaluable: 0,
  });
  assert.equal(result.findings[0]?.reasonCode, "DRAFT_CONFLICT");
});

test("normalizes Korean currency units to exact base-KRW decimal strings", () => {
  assert.equal(normalizeKrwDecimal("200", "억원"), "20000000000");
  assert.equal(normalizeKrwDecimal("20,000,000,000", "원"), "20000000000");
  assert.equal(normalizeKrwDecimal("0.00000001", "억원"), "1");
  assert.equal(normalizeKrwDecimal("900719925474099312345", "원"), "900719925474099312345");
  const result = evaluateEvidenceFactConsistency({
    draftText: "2026년 매출액 20,000,000,000원",
    sources: [source("2026년 매출 200억원")],
  });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.details.counts.matched, 1);
});

test("normalizes NFKC, whitespace, particles, metric and unit aliases", () => {
  const [parsed] = parseEvidenceAssertions("Ｐｒｏｊｅｃｔ Ａ 는 ２０２６ 년 매출액 ２００ 억 원");
  assert.deepEqual(parsed && {
    subject: parsed.subject,
    period: parsed.period,
    metric: parsed.metric,
    unit: parsed.unit,
    value: parsed.value,
  }, {
    subject: "project a",
    period: "2026",
    metric: "revenue",
    unit: "KRW",
    value: "20000000000",
  });
});

test("does not compare assertions with different subject, period, or metric", () => {
  for (const evidence of [
    "Project B는 2026년 매출 200억원",
    "Project A는 2025년 매출 200억원",
    "Project A는 2026년 영업이익 200억원",
  ]) {
    const result = evaluateEvidenceFactConsistency({
      draftText: "Project A는 2026년 매출 360억원",
      sources: [source(evidence)],
    });
    assert.equal(result.details.counts.draftConflict, 0);
    assert.equal(result.details.counts.sourceConflict, 0);
  }
});

test("blocks same-key conflicting active source values with a stable reason", () => {
  const result = evaluateEvidenceFactConsistency({
    draftText: "2026년 매출 200억원",
    sources: [source("2026년 매출 200억원", "a"), source("2026년 매출 210억원", "b")],
  });
  assert.equal(result.verdict, "BLOCK");
  assert.equal(result.findings[0]?.reasonCode, "SOURCE_CONFLICT");
  assert.equal(result.details.counts.sourceConflict, 1);
});

test("safe details contain only stable sorted SHA-256 references", () => {
  const result = evaluateEvidenceFactConsistency({
    draftText: "Project A는 2026년 매출 360억원",
    sources: [source("Project A는 2026년 매출 200억원", "z"), source("Project A는 2026년 매출 200억원", "a")],
  });
  for (const refs of [result.details.documentRefs, result.details.factRefs, result.details.claimRefs]) {
    assert.deepEqual(refs, [...refs].sort());
    assert.equal(new Set(refs).size, refs.length);
    assert.ok(refs.every((ref) => /^sha256:[0-9a-f]{64}$/.test(ref)));
  }
  assert.deepEqual(result.details.claimRefs, []);
  const serialized = JSON.stringify(result.details);
  for (const unsafe of ["Project A", "360", "200억원", "매출", "z"]) {
    assert.equal(serialized.includes(unsafe), false);
  }
});

test("telemetry fact references depend only on opaque evidence lineage", () => {
  const first = evaluateEvidenceFactConsistency({
    draftText: "Project A는 2026년 매출 200억원",
    sources: [source("Project A는 2026년 매출 200억원")],
  });
  const second = evaluateEvidenceFactConsistency({
    draftText: "Project A는 2026년 매출 360억원",
    sources: [source("Project A는 2026년 매출 360억원")],
  });
  assert.deepEqual(first.details.factRefs, second.details.factRefs);
  assert.deepEqual(first.details.claimRefs, []);
  assert.deepEqual(second.details.claimRefs, []);
});

test("unparseable assertions are not evaluable and never guessed", () => {
  const result = evaluateEvidenceFactConsistency({
    draftText: "매출은 크게 성장했습니다.",
    sources: [source("약 이백억원 수준입니다.")],
  });
  assert.equal(result.verdict, "NOT_EVALUABLE");
  assert.equal(result.details.counts.notEvaluable, 1);
  assert.equal(result.findings.length, 0);
});
