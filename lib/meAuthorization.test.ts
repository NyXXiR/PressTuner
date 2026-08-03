import assert from "node:assert/strict";
import test from "node:test";

import { toFlat } from "@/stores/useMeStore";

test("the me mapper preserves server-provided super-admin authorization", () => {
  assert.equal(toFlat({ ok: true, isSuperAdmin: true }).isSuperAdmin, true);
  assert.equal(toFlat({ ok: true, isSuperAdmin: false }).isSuperAdmin, false);
});

test("the me mapper fails closed when super-admin authorization is absent", () => {
  assert.equal(toFlat({ ok: true }).isSuperAdmin, false);
});
