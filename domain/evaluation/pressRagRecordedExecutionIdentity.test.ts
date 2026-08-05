import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  derivePressRagRecordedExecutionRef,
  PRESS_RAG_RECORDED_EXECUTION_REF_SCHEME,
  PRESS_RAG_RECORDED_EXECUTION_REF_VERSION,
} from "./pressRagRecordedExecutionIdentity";

test("derives a deterministic domain-separated recorded execution reference", () => {
  const raw = "CL-034-00000000-0000-4000-8000-000000000001";
  const expected = createHash("sha256")
    .update("press-rag-recorded-operation/sha256-v1\0")
    .update(raw)
    .digest("hex");

  assert.equal(PRESS_RAG_RECORDED_EXECUTION_REF_VERSION, "press-rag-recorded-execution-ref/v1");
  assert.equal(PRESS_RAG_RECORDED_EXECUTION_REF_SCHEME, "pragop_v1");
  assert.equal(derivePressRagRecordedExecutionRef(raw), `pragop_v1_${expected}`);
  assert.match(derivePressRagRecordedExecutionRef(raw), /^pragop_v1_[a-f0-9]{64}$/);
  assert.notEqual(derivePressRagRecordedExecutionRef(raw), createHash("sha256").update(raw).digest("hex"));
});

test("different recorded execution IDs produce different references", () => {
  assert.notEqual(
    derivePressRagRecordedExecutionRef("case-run-a"),
    derivePressRagRecordedExecutionRef("case-run-b"),
  );
});

test("rejects empty and oversized recorded execution IDs", () => {
  assert.throws(() => derivePressRagRecordedExecutionRef(""), /PRESS_RAG_RECORDED_EXECUTION_ID_INVALID/);
  assert.throws(
    () => derivePressRagRecordedExecutionRef("x".repeat(161)),
    /PRESS_RAG_RECORDED_EXECUTION_ID_INVALID/,
  );
});
