import assert from "node:assert/strict";
import test from "node:test";

import { redactRegressionExcerpt, scanSensitiveText } from "./sensitiveDataRedaction";

test("bounds excerpts and removes secrets and direct identifiers", () => {
  const result = redactRegressionExcerpt("email a@example.com token sk_abcdefghijklmnop phone +1 415 555 0100 " + "x".repeat(600));
  assert.ok(result.excerpt.length <= 500);
  assert.ok(!result.excerpt.includes("a@example.com"));
  assert.ok(!result.excerpt.includes("sk_abcdefghijklmnop"));
  assert.ok(result.redactionCount >= 3);
  assert.equal(result.containsProhibitedData, true);
});

test("scans sensitive text without mutating it", () => {
  const value = "contact qa@example.com or +82 10-1234-5678 with Bearer abc.def.ghi";
  const result = scanSensitiveText(value);

  assert.equal(value, "contact qa@example.com or +82 10-1234-5678 with Bearer abc.def.ghi");
  assert.equal(result.containsSensitiveData, true);
  assert.deepEqual(result.kinds, ["CREDENTIAL", "EMAIL", "PHONE"]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.kinds));
});

test("reports safe prose without redaction", () => {
  assert.deepEqual(scanSensitiveText("승인된 합성 문서의 3페이지"), {
    containsSensitiveData: false,
    kinds: [],
  });
});
