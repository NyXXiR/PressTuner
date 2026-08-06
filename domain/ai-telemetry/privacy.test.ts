import assert from "node:assert/strict";
import test from "node:test";
import { boundTelemetryText, internalEvidence } from "./privacy";

test("internal evidence is bounded and hashed", () => {
  const evidence = internalEvidence({ sourceField: "rawText", factKind: "TEXT", factValue: "x".repeat(1000), matchStatus: "MISSING", reasonCode: "FACT_MISSING" });
  assert.ok(evidence.factValue.length <= 240); assert.match(evidence.factHash, /^[0-9a-f]{64}$/); assert.equal(boundTelemetryText("a\n\tb"), "a b");
});
