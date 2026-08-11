import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_EVIDENCE_GUARDRAIL_ID,
  PUBLIC_PRESS_RAG_EVIDENCE,
  PUBLIC_PRESS_RAG_GUIDED_MEMO,
  PressRagCommandRequestSchema,
  PressRagStartRequestSchema,
  ensureMemoClaimsEnumerated,
  publicPressRagScenarioProcess,
  verifyNormalizedClaims,
  type PressRagNormalizationOutput,
} from "./pressRagScenarioContract";

const citation = (factIndex: number) => ({
  sourceDocumentId: PUBLIC_PRESS_RAG_EVIDENCE.id,
  factId: PUBLIC_PRESS_RAG_EVIDENCE.facts[factIndex].id,
  evidenceExcerpt: PUBLIC_PRESS_RAG_EVIDENCE.facts[factIndex].excerpt,
});

const output = (claims: PressRagNormalizationOutput["claims"]): PressRagNormalizationOutput => ({
  serviceName: "Bridge",
  announceType: "출시",
  oneLiner: "Bridge 출시",
  points: ["출시"],
  tone: "formal",
  rawText: "memo",
  claims,
});

test("public schemas are strict and commands are bounded discriminated inputs", () => {
  assert.equal(PressRagStartRequestSchema.safeParse({ memo: "x", tone: "formal", extra: true }).success, false);
  assert.equal(PressRagCommandRequestSchema.safeParse({ type: "advance_edge", capability: "c", expectedRevision: 0, extra: true }).success, false);
  assert.equal(PressRagCommandRequestSchema.safeParse({ type: "execute_node", capability: "c", expectedRevision: 0, reviewInstruction: "x".repeat(1001) }).success, false);
});

test("the demo topology preserves the canonical five nodes and adds one bounded review loop", () => {
  assert.deepEqual(publicPressRagScenarioProcess.nodes.map((node) => node.id), [
    "article-initialization", "brief-normalization", "draft-generation", "draft-review", "selected-rewrite",
  ]);
  const loop = publicPressRagScenarioProcess.edges.find((edge) => edge.id === "review-repeat");
  assert.deepEqual({ source: loop?.source, target: loop?.target }, { source: "draft-review", target: "draft-review" });
  assert.ok(publicPressRagScenarioProcess.edges.find((edge) => edge.id === "brief-draft")?.mandatoryGuardrailIds.some((id) => id === FIXED_EVIDENCE_GUARDRAIL_ID));
});

test("fixed evidence passes supported atomic claims and blocks market-share claims", () => {
  const supported = verifyNormalizedClaims(output([
    { claim: "MonoLab은 Bridge를 2026-09-18에 출시합니다.", citation: citation(0) },
    { claim: "베타 설문 참여자는 120명이고 만족도는 92%입니다.", citation: citation(1) },
    { claim: "실시간 공동 편집과 승인 워크플로를 제공합니다.", citation: citation(2) },
  ]));
  assert.equal(supported.verdict, "PASS");
  const blocked = verifyNormalizedClaims(output([
    { claim: "국내 협업툴 시장 점유율 1위입니다.", citation: null },
  ]));
  assert.equal(blocked.verdict, "BLOCK");
  assert.match(blocked.observed, /점유율 1위/);
  assert.match(PUBLIC_PRESS_RAG_GUIDED_MEMO, /점유율 1위/);
});

test("invalid IDs, non-verbatim excerpts and fabricated numeric or rank tokens block", () => {
  for (const claims of [
    [{ claim: "2026-09-18 출시", citation: { ...citation(0), factId: "missing" } }],
    [{ claim: "2026-09-18 출시", citation: { ...citation(0), evidenceExcerpt: "요약 발췌" } }],
    [{ claim: "2026-09-19 출시", citation: citation(0) }],
    [{ claim: "시장 점유율 1위", citation: citation(0) }],
  ] as PressRagNormalizationOutput["claims"][]) {
    assert.equal(verifyNormalizedClaims(output(claims)).verdict, "BLOCK");
  }
});

test("memo enumeration tolerates harmless model wording changes without hiding unsupported claims", () => {
  const memo = [
    "MonoLab은 팀 협업 서비스 Bridge를 2026-09-18에 출시합니다.",
    "Bridge 베타 설문은 참여자 120명 대상이며 만족도는 92%입니다.",
    "실시간 공동 편집과 승인 워크플로를 제공합니다.",
    "국내 협업툴 시장 점유율 1위입니다.",
  ].join(" ");
  const enumerated = ensureMemoClaimsEnumerated(memo, output([
    { claim: "MonoLab의 Bridge 출시일은 2026-09-18입니다.", citation: citation(0) },
    { claim: "120명 대상 베타 설문의 만족도는 92%입니다.", citation: citation(1) },
    { claim: "Bridge는 실시간 공동 편집 및 승인 워크플로를 제공합니다.", citation: citation(2) },
    { claim: "국내 협업툴 시장 점유율 1위입니다.", citation: null },
  ]));

  assert.equal(enumerated.claims.length, 4);
  assert.deepEqual(enumerated.claims.map((item) => item.claim), memo.split(/(?<=[.!?。])\s+/u));
  assert.equal(verifyNormalizedClaims(enumerated).verdict, "BLOCK");

  const repaired = ensureMemoClaimsEnumerated(
    memo.split(/(?<=[.!?。])\s+/u).slice(0, 3).join(" "),
    output(enumerated.claims.slice(0, 3).map((item, index) => ({ ...item, claim: [
      "MonoLab의 Bridge 출시일은 2026-09-18입니다.",
      "120명 대상 베타 설문의 만족도는 92%입니다.",
      "Bridge는 실시간 공동 편집 및 승인 워크플로를 제공합니다.",
    ][index] }))),
  );
  assert.equal(verifyNormalizedClaims(repaired).verdict, "PASS");
});
