import assert from "node:assert/strict";
import test from "node:test";

import { PressDomainError } from "@/domain/press/pressProcess";
import { mapPressDomainConflict, mapPressFinalizationConflict } from "./pressFinalizationApi";

test("press finalization exposes expected verification conflicts", () => {
  assert.deepEqual(
    mapPressFinalizationConflict(new Error("ARTICLE_VERIFICATION_BLOCKED")),
    {
      status: 409,
      code: "ARTICLE_VERIFICATION_BLOCKED",
      message: "차단된 사실 오류를 수정하고 다시 검증해 주세요.",
    },
  );
  assert.deepEqual(
    mapPressFinalizationConflict(new Error("PRESS_TRANSITION_INVALID")),
    {
      status: 409,
      code: "PRESS_TRANSITION_INVALID",
      message: "요청한 상태 전환을 수행할 수 없습니다.",
    },
  );
  assert.equal(mapPressFinalizationConflict(new Error("DB_UNAVAILABLE")), null);
});

test("common mapper preserves the exact domain conflict", () => {
  assert.deepEqual(mapPressDomainConflict(new PressDomainError("PRESS_FINALIZED_IMMUTABLE")), {
    status: 409,
    code: "PRESS_FINALIZED_IMMUTABLE",
    message: "최종 확정된 문서는 변경할 수 없습니다.",
  });
  assert.equal(mapPressDomainConflict(new Error("PRESS_FINALIZED_IMMUTABLE")), null);
});
