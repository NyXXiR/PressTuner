import assert from "node:assert/strict";
import test from "node:test";

import { classifyAgentFailure } from "./failureTaxonomy";

test("normalizes runtime failures without preserving sensitive messages", () => {
  assert.equal(classifyAgentFailure(new Error("PRESS_AGENT_TOOL_TIMEOUT:secret")), "TOOL_TIMEOUT");
  assert.equal(classifyAgentFailure("PRESS_AGENT_TENANT_SCOPE_MISMATCH"), "TENANT_SCOPE_VIOLATION");
  assert.equal(classifyAgentFailure("opaque"), "UNKNOWN");
});
