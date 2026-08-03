import assert from "node:assert/strict";
import test from "node:test";

import { filterActionableReviewNotes } from "./reviewNotePolicy";

test("review filtering removes no-op replacements, duplicates, and missing quotes", () => {
  const plain = "서울에 기반을 둔 팀이다. 작성 시간이 40% 줄었다.";
  assert.deepEqual(
    filterActionableReviewNotes(plain, [
      {
        quote: "서울에 기반을 둔",
        note: "'서울에 기반을 둔'을 '서울에 기반을 둔'으로 수정하세요.",
        type: "TONE",
      },
      {
        quote: "작성 시간이 40% 줄었다.",
        note: "측정 기준을 함께 밝혀 신뢰도를 높이세요.",
        type: "RISK",
        sourceFactIds: ["fact-1"],
      },
      {
        quote: "작성 시간이 40% 줄었다.",
        note: "측정 기준을 함께 밝혀 신뢰도를 높이세요.",
        type: "RISK",
        sourceFactIds: ["fact-1"],
      },
      { quote: "본문에 없는 문장", note: "삭제하세요.", type: "HINT" },
    ]),
    [
      {
        quote: "작성 시간이 40% 줄었다.",
        note: "측정 기준을 함께 밝혀 신뢰도를 높이세요.",
        type: "RISK",
        sourceFactIds: ["fact-1"],
      },
    ],
  );
});
