import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAgentAuditDetails } from "./agentAuditService";

test("audit sanitization removes nested secrets and bounds strings", () => {
  const sanitized = sanitizeAgentAuditDetails({
    safe: "x".repeat(700),
    nested: { accessToken: "secret", value: "kept" },
    rows: [{ prompt: "hidden", id: "visible" }],
  });
  assert.equal((sanitized.safe as string).length, 500);
  assert.deepEqual(sanitized.nested, { value: "kept" });
  assert.deepEqual(sanitized.rows, [{ id: "visible" }]);
});
