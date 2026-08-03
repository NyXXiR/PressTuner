import assert from "node:assert/strict";
import test from "node:test";

import { redactRegressionExcerpt } from "./sensitiveDataRedaction";

test("bounds excerpts and removes secrets and direct identifiers", () => {
  const result = redactRegressionExcerpt("email a@example.com token sk_abcdefghijklmnop phone +1 415 555 0100 " + "x".repeat(600));
  assert.ok(result.excerpt.length <= 500);
  assert.ok(!result.excerpt.includes("a@example.com"));
  assert.ok(!result.excerpt.includes("sk_abcdefghijklmnop"));
  assert.ok(result.redactionCount >= 3);
  assert.equal(result.containsProhibitedData, true);
});
