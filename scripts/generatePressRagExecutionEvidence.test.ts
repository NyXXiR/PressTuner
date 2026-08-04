import assert from "node:assert/strict";
import test from "node:test";

import { buildPressRagExecutionEvidenceBytes } from "./generatePressRagExecutionEvidence";

test("Press RAG execution-evidence generator is byte deterministic", async () => {
  const first = await buildPressRagExecutionEvidenceBytes(); const second = await buildPressRagExecutionEvidenceBytes();
  assert.equal(first, second); assert.match(first, /"schemaVersion": "press-rag\/execution-evidence\/v1"/);
});
