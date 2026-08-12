import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_PRESS_RAG_EVIDENCE, type PressRagNormalizationOutput } from "./pressRagScenarioContract";
import {
  advancePublicPressRagEdge,
  createPublicPressRagAttempt,
  executePublicPressRagNode,
  retryPublicPressRagFromBlock,
} from "./pressRagScenarioMachine";

let id = 0;
const context = () => ({ now: 1_800_000_000_000 + id, id: () => String(++id) });
const citation = (index: number) => ({ sourceDocumentId: PUBLIC_PRESS_RAG_EVIDENCE.id, factId: PUBLIC_PRESS_RAG_EVIDENCE.facts[index].id, evidenceExcerpt: PUBLIC_PRESS_RAG_EVIDENCE.facts[index].excerpt });
const normalized = (claims: PressRagNormalizationOutput["claims"]): PressRagNormalizationOutput => ({ serviceName: "Bridge", announceType: "출시", oneLiner: "Bridge 출시", points: ["근거"], tone: "formal", rawText: "memo", claims });

test("block, retry lineage, review self-loop and repeated checkpoints form one legal run", () => {
  let attempt = createPublicPressRagAttempt({ runId: "run", memo: "시장 점유율 1위입니다.", tone: "formal", now: 1_800_000_000_000 });
  attempt = executePublicPressRagNode({ attempt, input: { type: "PRESS_RELEASE" }, output: { articleId: attempt.articleId }, context: context() });
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { rawText: attempt.inputSnapshot.rawText }, output: normalized([{ claim: "시장 점유율 1위입니다.", citation: null }]), context: context() });
  assert.equal(attempt.status, "BLOCKED");
  assert.equal(attempt.transitions.at(-1)?.edgeId, "brief-draft");
  assert.throws(() => advancePublicPressRagEdge(attempt, context()), /PRESS_RAG_EDGE_OUT_OF_ORDER/);

  const parent = attempt;
  attempt = retryPublicPressRagFromBlock({ attempt, correctedMemo: "MonoLab은 Bridge를 2026-09-18에 출시합니다.", context: context() });
  assert.equal(attempt.parentAttemptId, parent.id);
  assert.equal(attempt.activeNodeId, "brief-normalization");
  assert.deepEqual(attempt.checkpoints.map((checkpoint) => checkpoint.mode), ["RESTORED"]);

  attempt = executePublicPressRagNode({ attempt, input: { rawText: attempt.inputSnapshot.rawText }, output: normalized([{ claim: "MonoLab은 Bridge를 2026-09-18에 출시합니다.", citation: citation(0) }]), context: context() });
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { confirmedBrief: true }, output: { title: "Bridge 출시", plain: "본문" }, context: context() });
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { title: "Bridge 출시" }, output: { notes: [{ id: "note-1", message: "제목 개선" }] }, context: context() });
  assert.equal(attempt.transitions.at(-1)?.edgeId, "review-repeat");
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { title: "Bridge 출시" }, output: { notes: [{ id: "note-2", message: "리드 개선" }] }, context: context() });
  assert.equal(attempt.transitions.at(-1)?.edgeId, "review-rewrite");
  assert.equal(attempt.checkpoints.filter((checkpoint) => checkpoint.nodeId === "draft-review").length, 2);
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { selectedNoteIds: ["note-2"] }, output: { title: "최종", plain: "최종 본문" }, context: context() });
  assert.equal(attempt.status, "COMPLETED");
});

test("controlled PDF policy preserves parent BLOCK and gives corrected child PASS", () => {
  let attempt = createPublicPressRagAttempt({ runId: "revenue", memo: "Bridge는 2026년 매출 360억원을 기록했습니다.", tone: "formal", now: 1_800_000_000_000 });
  attempt = executePublicPressRagNode({ attempt, input: { type: "PRESS_RELEASE" }, output: { articleId: attempt.articleId }, context: context() });
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { rawText: attempt.inputSnapshot.rawText }, output: normalized([{ claim: attempt.inputSnapshot.rawText, citation: citation(3) }]), context: context() });
  attempt = advancePublicPressRagEdge(attempt, context());
  attempt = executePublicPressRagNode({ attempt, input: { confirmedBrief: true }, output: { title: "Bridge 실적", plain: "Bridge는 2026년 매출 360억원을 기록했습니다." }, context: context() });
  assert.equal(attempt.status, "BLOCKED");
  assert.equal(attempt.transitions.at(-1)?.edgeId, "draft-review");
  const parent = attempt;
  attempt = retryPublicPressRagFromBlock({ attempt, correctedMemo: "Bridge는 2026년 매출 200억원을 기록했습니다.", context: context() });
  assert.equal(attempt.activeNodeId, "draft-generation");
  attempt = executePublicPressRagNode({ attempt, input: { confirmedBrief: true }, output: { title: "Bridge 실적", plain: "Bridge는 2026년 매출 200억원을 기록했습니다." }, context: context() });
  assert.equal(attempt.transitions.at(-1)?.verdict, "PASS");
  assert.equal(parent.transitions.at(-1)?.verdict, "BLOCK");
  const evidence = attempt.transitions.at(-1)?.observations.find((item) => item.guardrailId === "evidence-fact-consistency")?.evidence;
  assert.equal(JSON.stringify(evidence).includes("200억원"), false);
});
