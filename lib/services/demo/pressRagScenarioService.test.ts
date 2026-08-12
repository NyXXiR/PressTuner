import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_PRESS_RAG_EVIDENCE } from "@/domain/demo/pressRagScenarioContract";
import { writePressRagSession } from "./pressRagScenarioSecurity";
import { commandPublicPressRagScenario, startPublicPressRagScenario, type PressRagCompletionKind } from "./pressRagScenarioService";

const secret = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
const memo = "MonoLab은 Bridge를 2026-09-18에 출시합니다. 국내 협업툴 시장 점유율 1위입니다.";
const outputs: Record<PressRagCompletionKind, unknown> = {
  normalization: { serviceName: "Bridge", announceType: "출시", oneLiner: "Bridge 출시", points: ["출시"], tone: "formal", rawText: memo, claims: [
    { claim: "MonoLab은 Bridge를 2026-09-18에 출시합니다.", citation: { sourceDocumentId: PUBLIC_PRESS_RAG_EVIDENCE.id, factId: PUBLIC_PRESS_RAG_EVIDENCE.facts[0].id, evidenceExcerpt: PUBLIC_PRESS_RAG_EVIDENCE.facts[0].excerpt } },
    { claim: "국내 협업툴 시장 점유율 1위입니다.", citation: null },
  ] },
  draft: { title: "Bridge 출시", plain: "본문" },
  review: { notes: [{ id: "note-1", message: "제목을 개선하세요." }] },
  rewrite: { title: "Bridge 공식 출시", plain: "수정 본문" },
};

test("service stores exact business input/output and keeps model completion injectable", async () => {
  let id = 0;
  const started = startPublicPressRagScenario({ memo, tone: "formal" }, { secret, now: 1000, id: () => `id-${++id}` });
  let scenario = started.scenario;
  let cookie = writePressRagSession(started.session, secret);
  const calls: Array<{ kind: string; input: unknown }> = [];
  const completeJson = async (request: { kind: PressRagCompletionKind; input: unknown }) => { calls.push(request); return outputs[request.kind]; };
  let result = await commandPublicPressRagScenario({ type: "execute_node", capability: scenario.capability, expectedRevision: scenario.attempt.revision }, { secret, cookie, now: 1100, id: () => `id-${++id}`, completeJson });
  assert.equal(calls.length, 0, "initialization must not call a model");
  assert.deepEqual(result.scenario.attempt.checkpoints[0].input, { type: "PRESS_RELEASE" });
  cookie = writePressRagSession(result.session, secret); scenario = result.scenario;
  result = await commandPublicPressRagScenario({ type: "advance_edge", capability: scenario.capability, expectedRevision: scenario.attempt.revision }, { secret, cookie, now: 1200, id: () => `id-${++id}`, completeJson });
  cookie = writePressRagSession(result.session, secret); scenario = result.scenario;
  result = await commandPublicPressRagScenario({ type: "execute_node", capability: scenario.capability, expectedRevision: scenario.attempt.revision }, { secret, cookie, now: 1300, id: () => `id-${++id}`, completeJson });
  assert.equal(calls[0].kind, "normalization");
  assert.equal((calls[0].input as { rawText: string }).rawText, memo);
  assert.equal(result.scenario.attempt.status, "BLOCKED");
  assert.equal(result.scenario.commandsRemaining, 17);
});

test("provider failure consumes a command and returns a recoverable capability", async () => {
  const started = startPublicPressRagScenario({ memo, tone: "formal" }, { secret, now: 1000, id: () => "run" });
  const cookie = writePressRagSession(started.session, secret);
  const first = await commandPublicPressRagScenario({ type: "execute_node", capability: started.scenario.capability, expectedRevision: 0 }, { secret, cookie, now: 1100, completeJson: async () => { throw new Error("must not run"); } });
  const advancedCookie = writePressRagSession(first.session, secret);
  const advanced = await commandPublicPressRagScenario({ type: "advance_edge", capability: first.scenario.capability, expectedRevision: 1 }, { secret, cookie: advancedCookie, now: 1200, completeJson: async () => ({}) });
  await assert.rejects(
    () => commandPublicPressRagScenario({ type: "execute_node", capability: advanced.scenario.capability, expectedRevision: 2 }, { secret, cookie: writePressRagSession(advanced.session, secret), now: 1300, completeJson: async () => { throw new Error("provider down"); } }),
    (error: unknown) => Boolean(error && typeof error === "object" && (error as { status?: number }).status === 502 && (error as { scenario?: { attempt: { revision: number } } }).scenario?.attempt.revision === 3),
  );
});

test("fake completions drive all four AI node types through retry, two reviews and rewrite", async () => {
  let id = 0;
  const started = startPublicPressRagScenario({ memo, tone: "formal" }, { secret, now: 2000, id: () => `full-${++id}` });
  let scenario = started.scenario;
  let session = started.session;
  const kinds: PressRagCompletionKind[] = [];
  const completeJson = async (request: { kind: PressRagCompletionKind; input: unknown }) => {
    kinds.push(request.kind);
    if (request.kind === "normalization") {
      const rawText = (request.input as { rawText: string }).rawText;
      return rawText.includes("점유율") ? outputs.normalization : {
        serviceName: "Bridge", announceType: "출시", oneLiner: "Bridge 출시", points: ["출시"], tone: "formal", rawText,
        claims: [{ claim: rawText, citation: { sourceDocumentId: PUBLIC_PRESS_RAG_EVIDENCE.id, factId: PUBLIC_PRESS_RAG_EVIDENCE.facts[0].id, evidenceExcerpt: PUBLIC_PRESS_RAG_EVIDENCE.facts[0].excerpt } }],
      };
    }
    return outputs[request.kind];
  };
  const run = async (command: Record<string, unknown>) => {
    const result = await commandPublicPressRagScenario({ ...command, capability: scenario.capability, expectedRevision: scenario.attempt.revision }, { secret, cookie: writePressRagSession(session, secret), now: 2000 + id, id: () => `full-${++id}`, completeJson });
    scenario = result.scenario;
    session = result.session;
  };
  await run({ type: "execute_node" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node" });
  assert.equal(scenario.attempt.status, "BLOCKED");
  await run({ type: "retry_from_block", correctedMemo: "MonoLab은 Bridge를 2026-09-18에 출시합니다." });
  await run({ type: "execute_node" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node", reviewInstruction: "첫 리뷰" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node", reviewInstruction: "두 번째 리뷰" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node", selectedNoteIds: ["note-1"], rewriteInstruction: "선택 노트 반영" });
  assert.deepEqual(kinds, ["normalization", "normalization", "draft", "review", "review", "rewrite"]);
  assert.equal(scenario.attempt.status, "COMPLETED");
  assert.equal(scenario.attempts.length, 2);
  assert.equal(scenario.attempt.checkpoints.filter((item) => item.nodeId === "draft-review").length, 2);
  assert.equal(scenario.attempt.checkpoints.at(-1)?.input && (scenario.attempt.checkpoints.at(-1)?.input as { selectedNoteIds: string[] }).selectedNoteIds[0], "note-1");
});

test("service auto-mounts PDF evidence and deterministically demonstrates draft BLOCK to child PASS", async () => {
  let id = 0;
  const controlledMemo = "Bridge는 2026년 매출 360억원을 기록했습니다.";
  const started = startPublicPressRagScenario({ memo: controlledMemo, tone: "formal" }, { secret, now: 3_000, id: () => `controlled-${++id}` });
  assert.equal(started.scenario.evidence.assetUrl, "/samples/press-ai-debugger/evidence-fact-consistency.pdf#page=1");
  let scenario = started.scenario;
  let session = started.session;
  const completeJson = async (request: { kind: PressRagCompletionKind; input: unknown }) => request.kind === "normalization"
    ? { serviceName: "Bridge", announceType: "실적", oneLiner: "Bridge 실적", points: [controlledMemo], tone: "formal", rawText: controlledMemo, claims: [{ claim: controlledMemo, citation: null }] }
    : request.kind === "draft"
      ? { title: "Bridge 실적", plain: "동일한 통제 문장" }
      : outputs[request.kind];
  const run = async (command: Record<string, unknown>) => {
    const result = await commandPublicPressRagScenario({ ...command, capability: scenario.capability, expectedRevision: scenario.attempt.revision }, { secret, cookie: writePressRagSession(session, secret), now: 3_000 + id, id: () => `controlled-${++id}`, completeJson });
    scenario = result.scenario;
    session = result.session;
  };
  await run({ type: "execute_node" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node" });
  await run({ type: "advance_edge" });
  await run({ type: "execute_node" });
  assert.equal(scenario.attempt.status, "BLOCKED");
  assert.equal(scenario.attempt.transitions.at(-1)?.edgeId, "draft-review");
  const parent = scenario.attempt;
  await run({ type: "retry_from_block", correctedMemo: "Bridge는 2026년 매출 200억원을 기록했습니다." });
  await run({ type: "execute_node" });
  assert.equal(scenario.attempt.transitions.at(-1)?.verdict, "PASS");
  assert.equal(scenario.attempts[0]?.id, parent.id);
  assert.equal(scenario.attempts[0]?.transitions.at(-1)?.verdict, "BLOCK");
});
