import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalArticlePlain,
  normalizeEditedPlainForPersistence,
} from "./articleCanonicalContent";

test("canonical article plain includes each structural part exactly once", () => {
  assert.equal(
    buildCanonicalArticlePlain({
      lead: "리드",
      fact: "팩트",
      paragraphs: [{ text: "본문", importance: 0 }],
      closing: "맺음말",
      rawInput: "원문",
    }),
    "리드\n\n팩트\n\n본문\n\n맺음말",
  );
});

test("edited plain persistence clears stale lead and fact fields", () => {
  assert.deepEqual(normalizeEditedPlainForPersistence("첫 문단\n\n둘째 문단"), {
    lead: null,
    fact: null,
    paragraphs: [
      { text: "첫 문단", importance: 0 },
      { text: "둘째 문단", importance: 0 },
    ],
    closing: "",
  });
});
