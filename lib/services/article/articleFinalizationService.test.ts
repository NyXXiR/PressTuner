import assert from "node:assert/strict";
import test from "node:test";

import { assertFinalizableVerification } from "./articleFinalizationService";

const current = {
  draftHash: "draft",
  groundingRevision: 2,
  corpusVersion: 3,
};

test("FINAL rejects missing, stale, and blocked verification", () => {
  assert.throws(
    () => assertFinalizableVerification(null, current),
    /ARTICLE_VERIFICATION_REQUIRED/,
  );
  assert.throws(
    () =>
      assertFinalizableVerification(
        { ...current, draftHash: "old", result: "PASS" },
        current,
      ),
    /ARTICLE_VERIFICATION_STALE/,
  );
  assert.throws(
    () =>
      assertFinalizableVerification({ ...current, result: "BLOCK" }, current),
    /ARTICLE_VERIFICATION_BLOCKED/,
  );
});

test("FINAL accepts current PASS and WARN verification", () => {
  for (const result of ["PASS", "WARN"] as const) {
    assert.doesNotThrow(() =>
      assertFinalizableVerification({ ...current, result }, current),
    );
  }
});
