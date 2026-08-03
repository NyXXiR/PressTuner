import assert from "node:assert/strict";
import test from "node:test";

import { normalizeUsedFactIds } from "./articleGenerator";
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
