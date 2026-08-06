import assert from "node:assert/strict";
import test from "node:test";
import { generateArticleWithLLM } from "@/lib/llm/articleGenerator";
import { resolvePressAiDependencies, type PressAiDependencies } from "./pressAiDependencies";

test("production dependency defaults retain identity unless explicitly overridden", () => {
  const production: PressAiDependencies = { completeJson: async () => "{}", searchKnowledge: async () => ({}), loadKnowledgeContexts: async () => ({}), now: () => new Date(0) };
  assert.equal(resolvePressAiDependencies(undefined, production).completeJson, production.completeJson);
  const completeJson = async () => "{\"ok\":true}";
  assert.equal(resolvePressAiDependencies({ completeJson }, production).completeJson, completeJson);
});

test("article generation uses the deterministic completion and clock adapters without network", async () => {
  let calls = 0;
  const result = await generateArticleWithLLM({ announceType: "출시", points: ["근거"], tone: "formal", publishAt: "" }, { dependencies: { now: () => new Date("2031-04-17T00:00:00.000Z"), completeJson: async (request) => { calls += 1; assert.match(request.messages[1].content, /2031/); return JSON.stringify({ title: "픽셔널", lead: "리드", fact: "사실", paragraphs: [{ text: "본문", importance: 3 }], closing: "끝", usedFactIds: [] }); } } });
  assert.equal(calls, 1); assert.equal(result.title, "픽셔널"); assert.equal(result.paragraphs[0].text, "본문");
});

