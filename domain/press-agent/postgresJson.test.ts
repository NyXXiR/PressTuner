import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePostgresJson } from "./postgresJson";

test("removes PostgreSQL-incompatible null characters from nested model output", () => {
  assert.deepEqual(
    sanitizePostgresJson({ answer: "a\u0000b", claims: [{ quote: "x\u0000y" }] }),
    { answer: "ab", claims: [{ quote: "xy" }] },
  );
});
