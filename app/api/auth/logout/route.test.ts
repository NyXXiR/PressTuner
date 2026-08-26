import assert from "node:assert/strict";
import test from "node:test";

import { logoutWithSessionCleanup } from "./route";

test("logout expires sid even when session storage is unavailable", async () => {
  const response = await logoutWithSessionCleanup(
    async () => { throw new Error("database unavailable"); },
    async () => { throw new Error("must not be called"); },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /sid=;/);
  assert.match(response.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
});

test("logout deletes a valid server session before expiring sid", async () => {
  const deleted: string[] = [];
  const response = await logoutWithSessionCleanup(
    async () => ({ id: "session-1" }),
    async (sessionId) => { deleted.push(sessionId); },
  );

  assert.deepEqual(deleted, ["session-1"]);
  assert.match(response.headers.get("set-cookie") ?? "", /sid=;/);
});
