import assert from "node:assert/strict";
import test from "node:test";

import { generateArticleWithLLM, normalizeUsedFactIds } from "./articleGenerator";
import {
  PRESS_RELEASE_SYSTEM_PROMPT,
  PRESS_RELEASE_USER_PROMPT,
} from "./prompts/press-release";

test("generation normalizes used fact IDs and prompts isolate style examples", () => {
  assert.deepEqual(normalizeUsedFactIds(["fact-1", 2, "fact-1", "fact-2"]), [
    "fact-1",
    "fact-2",
  ]);
  assert.match(PRESS_RELEASE_SYSTEM_PROMPT, /usedFactIds/);
  assert.match(PRESS_RELEASE_SYSTEM_PROMPT, /STYLE_EXAMPLE/);
  assert.match(PRESS_RELEASE_SYSTEM_PROMPT, /사용자 입력 메모와 확인된 브리프/);
  assert.match(
    PRESS_RELEASE_SYSTEM_PROMPT,
    /팀 문서에서 가져온 사실은 acceptedFacts/,
  );
  assert.match(PRESS_RELEASE_SYSTEM_PROMPT, /서울 기반/);
  assert.match(PRESS_RELEASE_SYSTEM_PROMPT, /측정 기준, 집계 방식/);
  assert.match(PRESS_RELEASE_USER_PROMPT, /acceptedFactsSection/);
  assert.match(PRESS_RELEASE_USER_PROMPT, /stylePolicySection/);
  assert.match(PRESS_RELEASE_USER_PROMPT, /styleExamplesSection/);
});

test("literal input is not treated as replacement syntax or recursively expanded template content", async () => {
  let prompt = "";
  await generateArticleWithLLM({
    announceType: "출시", serviceName: "$& {{toneDesc}}", points: [], tone: "friendly",
  }, { dependencies: { completeJson: async (request) => {
    prompt = request.messages[1].content;
    return '{}';
  } } });
  assert.ok(prompt.includes("서비스/제품 이름: $& {{toneDesc}}"));
});

test("injected time governs tense when the publication date is absent", async () => {
  let prompt = "";
  await generateArticleWithLLM({
    announceType: "출시", points: [], tone: "formal", eventAt: "2040-01-01T00:00:00Z",
  }, { dependencies: {
    now: () => new Date("2050-01-01T00:00:00Z"),
    completeJson: async (request) => { prompt = request.messages[1].content; return '{}'; },
  } });
  assert.match(prompt, /사건은 이미 일어났다/);
});
