import assert from "node:assert/strict";
import test from "node:test";
import { deriveCanonicalEventId, deriveCanonicalSpanId, generateCanonicalTraceId, normalizeCanonicalTraceId, pseudonymousActorReference } from "./identifiers";

test("canonical identifiers are stable and normalized", () => {
  assert.equal(normalizeCanonicalTraceId("123e4567-e89b-12d3-a456-426614174000"), "123e4567e89b12d3a456426614174000");
  assert.match(normalizeCanonicalTraceId("provider", "run"), /^[0-9a-f]{32}$/);
  assert.equal(deriveCanonicalEventId("a", 1), deriveCanonicalEventId("a", 1));
  assert.match(deriveCanonicalSpanId("a"), /^[0-9a-f]{16}$/);
  assert.notEqual(pseudonymousActorReference("user-1"), "user-1");
  const generated = generateCanonicalTraceId(() => "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(generated, "123e4567e89b12d3a456426614174000");
  assert.match(generateCanonicalTraceId(), /^[0-9a-f]{32}$/);
});
