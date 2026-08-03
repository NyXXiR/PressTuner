import assert from "node:assert/strict";
import test from "node:test";

import {
  canGeneratePressArticleWithUsage,
  normalizePlainDraftForPersistence,
} from "./pressService";

test("Press generation honors unlimited usage even when rolling remaining is zero", () => {
  assert.equal(
    canGeneratePressArticleWithUsage({ unlimited: true, remaining: 0 }),
    true,
  );
  assert.equal(
    canGeneratePressArticleWithUsage({ unlimited: false, remaining: 1 }),
    true,
  );
  assert.equal(
    canGeneratePressArticleWithUsage({ unlimited: false, remaining: 0 }),
    false,
  );
});

test("plain press drafts persist as an idempotent paragraph-only canonical body", () => {
  assert.deepEqual(
    normalizePlainDraftForPersistence(
      "리드 문장\n\n첫 번째 본문\n\n\n두 번째 본문\n\n맺음말",
    ),
    {
      lead: null,
      fact: null,
      paragraphs: [
        { text: "리드 문장", importance: 0 },
        { text: "첫 번째 본문", importance: 0 },
        { text: "두 번째 본문", importance: 0 },
        { text: "맺음말", importance: 0 },
      ],
      closing: "",
    },
  );
});
