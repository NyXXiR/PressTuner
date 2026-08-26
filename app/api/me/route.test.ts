import assert from "node:assert/strict";
import test from "node:test";

import { unauthorizedMeResponse } from "./route";

test("an unauthorized me response expires a stale sid cookie", async () => {
  const response = unauthorizedMeResponse();
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.match(response.headers.get("set-cookie") ?? "", /sid=;/);
  assert.match(response.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
});
