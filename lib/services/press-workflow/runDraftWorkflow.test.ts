import assert from "node:assert/strict";
import test from "node:test";
import { runDraftWorkflow } from "./runDraftWorkflow";
import type { PressAiCompletionRequest } from "../article/pressAiDependencies";

const args = {
  caseId: "friendly-launch", frozenAt: "2026-09-23T00:00:00.000Z",
  defaults: {
    revision: "team/v1", model: "test-model", tone: "formal",
    stylePolicy: "공식 발표문으로 쓴다.", requiredPhrases: ["10월 1일"], forbiddenPhrases: ["업계 최고"],
  },
  override: { revision: "request/v1", tone: "friendly", stylePolicy: "쉽고 친근하게 쓴다." },
  input: {
    announceType: "출시", serviceName: "테스트노트", points: ["10월 1일 출시"],
    rawText: "10월 1일 출시", acceptedFacts: [{ id: "f-1", content: "10월 1일 출시" }],
    styleExamples: "표현 예시이며 사실이 아님: 100만 명이 쓰는 가상제품",
  },
};
const output = {
  title: "테스트노트 출시", lead: "테스트노트가 10월 1일 출시돼요.", fact: "10월 1일 출시",
  paragraphs: [{ text: "메모를 정리해요.", importance: 3 }], closing: "", usedFactIds: ["f-1"],
};

test("uses the production generator, captures the exact resolved prompt and preserves evidence boundaries", async () => {
  let sent: PressAiCompletionRequest | undefined;
  const run = await runDraftWorkflow(args, {
    mode: "mock", completeJson: async (request) => { sent = structuredClone(request); return JSON.stringify(output); },
  });
  assert.equal(run.executionStatus, "COMPLETED");
  assert.deepEqual(run.request, sent);
  assert.equal(run.evidenceClass, "synthetic");
  const system = run.request!.messages[0].content;
  const user = run.request!.messages[1].content;
  assert.match(system, /친근/);
  assert.doesNotMatch(system, /한국 통신사|공식 발표문/);
  assert.match(system, /쉽고 친근하게/);
  assert.match(system, /STYLE_EXAMPLE/);
  assert.match(user, /\[f-1\] 10월 1일 출시/);
  assert.match(user, /업계 최고/);
  assert.match(user, /10월 1일/);
  assert.deepEqual(run.output, output);
  assert.equal(run.guardrailStatus, "PASS");
  assert.equal(run.qualityStatus, "NOT_EVALUATED");
  assert.ok(run.checks.some((c) => c.id === "factual-support" && c.status === "NOT_EVALUABLE"));
});

test("unknown fact IDs block and missing required/forbidden phrases warn without declaring factual truth", async () => {
  const run = await runDraftWorkflow(args, {
    mode: "mock", completeJson: async () => JSON.stringify({ ...output,
      lead: "업계 최고", fact: "새로운 제품", usedFactIds: ["style-example-1"],
    }),
  });
  assert.equal(run.guardrailStatus, "BLOCK");
  assert.deepEqual(run.checks.find((c) => c.id === "accepted-fact-ids")?.evidence, ["style-example-1"]);
  assert.equal(run.checks.find((c) => c.id === "required-phrase:0")?.status, "WARN");
  assert.equal(run.checks.find((c) => c.id === "forbidden-phrase:0")?.status, "WARN");
  assert.equal(run.qualityStatus, "NOT_EVALUATED");
});

test("malformed model output fails explicitly instead of passing the generator's permissive fallback", async () => {
  for (const raw of ["not json", JSON.stringify({ ...output, paragraphs: "invalid" })]) {
    const run = await runDraftWorkflow(args, { mode: "mock", completeJson: async () => raw });
    assert.equal(run.executionStatus, "FAILED");
    assert.equal(run.output, null);
    assert.equal(run.rawResponse, raw);
    assert.equal(run.guardrailStatus, "NOT_EVALUATED");
    assert.ok(run.requestHash);
    assert.ok(run.error);
  }
});

test("pending execution cannot be changed by mutating the caller's configuration", async () => {
  const input = structuredClone(args);
  const pending = runDraftWorkflow(input, { mode: "mock", completeJson: async () => {
    input.defaults.requiredPhrases.push("後から追加");
    input.input.acceptedFacts[0].content = "changed";
    return JSON.stringify(output);
  } });
  const run = await pending;
  assert.deepEqual(run.configuration.snapshot.effective.requiredPhrases, ["10월 1일"]);
  assert.equal(run.input.acceptedFacts[0].content, "10월 1일 출시");
});

test("bad input is rejected before any model call", async () => {
  let calls = 0;
  await assert.rejects(runDraftWorkflow({ ...args, input: { ...args.input, tone: "formal" } }, {
    mode: "mock", completeJson: async () => { calls++; return JSON.stringify(output); },
  }));
  assert.equal(calls, 0);
});
