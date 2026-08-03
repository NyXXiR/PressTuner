import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseAiAdviceText } from "./resumeAiAdvice";

test("returns plain advice text as-is", () => {
  assert.equal(parseAiAdviceText("두괄식으로 작성하세요."), "두괄식으로 작성하세요.");
});

test("extracts guideline from legacy JSON advice payloads", () => {
  const raw = JSON.stringify({
    rationale: "이 경험이 직무 적합성을 보여줍니다.",
    guideline: "지원 동기는 두괄식으로 작성하세요.",
  });

  assert.equal(parseAiAdviceText(raw), "지원 동기는 두괄식으로 작성하세요.");
});

test("falls back to rationale when guideline is missing", () => {
  const raw = JSON.stringify({ rationale: "직무 적합성을 보여주는 경험입니다." });

  assert.equal(parseAiAdviceText(raw), "직무 적합성을 보여주는 경험입니다.");
});

test("keeps malformed JSON-ish text and handles empty input", () => {
  assert.equal(parseAiAdviceText('{"guideline": broken'), '{"guideline": broken');
  assert.equal(parseAiAdviceText(""), "");
  assert.equal(parseAiAdviceText(null), "");
  assert.equal(parseAiAdviceText(undefined), "");
});
