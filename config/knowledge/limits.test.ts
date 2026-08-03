import assert from "node:assert/strict";
import test from "node:test";

import { loadKnowledgeLimits } from "./limits";

test("knowledge limits load documented defaults", () => {
  assert.deepEqual(loadKnowledgeLimits({}), {
    maxFileBytes: 20 * 1024 * 1024,
    maxDocumentsPerTeam: 25,
    maxStoredBytesPerTeam: 250 * 1024 * 1024,
    uploadRateLimit: 10,
    uploadRateWindowSeconds: 3600,
  });
});

test("knowledge limits reject invalid configuration", () => {
  for (const value of ["0", "-1", "1.5", "9007199254740992", "nope"]) {
    assert.throws(
      () => loadKnowledgeLimits({ KNOWLEDGE_UPLOAD_RATE_LIMIT: value }),
      /KNOWLEDGE_LIMIT_INVALID/,
    );
  }
});
