import assert from "node:assert/strict";
import test from "node:test";

import { PressDomainError } from "@/domain/press/pressProcess";
import { mapSavePressError } from "./route";

test("press save preserves finalized domain conflict status, code, and message", async () => {
  const response = mapSavePressError(
    new PressDomainError("PRESS_FINALIZED_IMMUTABLE"),
  );
  assert.ok(response);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "PRESS_FINALIZED_IMMUTABLE");
  assert.equal(body.message, "최종 확정된 문서는 변경할 수 없습니다.");
});
