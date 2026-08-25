import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

test("retired v1 snapshot route returns 404 without reading the body", async () => {
  const response = await POST();
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "");
});
