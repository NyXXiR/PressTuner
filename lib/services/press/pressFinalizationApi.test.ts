import assert from "node:assert/strict";
import test from "node:test";

import { mapPressFinalizationConflict } from "./pressFinalizationApi";

test("press finalization exposes expected verification conflicts", () => {
  assert.deepEqual(
    mapPressFinalizationConflict(new Error("ARTICLE_VERIFICATION_BLOCKED")),
    {
      status: 409,
      code: "ARTICLE_VERIFICATION_BLOCKED",
      message: "차단된 사실 오류를 수정하고 다시 검증해 주세요.",
    },
  );
  assert.equal(mapPressFinalizationConflict(new Error("DB_UNAVAILABLE")), null);
});
