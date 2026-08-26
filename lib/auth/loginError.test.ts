import assert from "node:assert/strict";
import test from "node:test";

import { getLoginErrorMessage } from "./loginError";

test("explains a transient OAuth database failure instead of hiding it", () => {
  assert.match(
    getLoginErrorMessage("oauth_database_unavailable") ?? "",
    /데이터베이스 연결이 불안정/,
  );
});

test("does not invent a message for an unknown login error", () => {
  assert.equal(getLoginErrorMessage("unknown_error"), null);
});
