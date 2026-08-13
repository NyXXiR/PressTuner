import assert from "node:assert/strict";
import test from "node:test";
import { AI_PROCESS_FACT_MAX_BACKOFF_MS, factRetryDelayMs, normalizeFactDeliveryError } from "./factTransport";

test("fact transport uses capped exponential retry", () => {
  assert.equal(factRetryDelayMs(1), 30_000);
  assert.equal(factRetryDelayMs(2), 60_000);
  assert.equal(factRetryDelayMs(99), AI_PROCESS_FACT_MAX_BACKOFF_MS);
});

test("contract, authentication, and sequence failures are permanent", () => {
  for (const code of ["CONTRACT_INVALID", "AUTHENTICATION_FAILED", "SEQUENCE_CONFLICT", "HTTP_REJECTED"]) {
    assert.deepEqual(normalizeFactDeliveryError(Object.assign(new Error(code), { code })), { status: "PERMANENT", code });
  }
  for (const code of ["TRANSPORT_TIMEOUT", "CONSOLE_THROTTLED", "CONSOLE_UNAVAILABLE", "TRANSPORT_FAILED"]) {
    assert.deepEqual(normalizeFactDeliveryError(Object.assign(new Error(code), { code })), { status: "RETRYABLE", code });
  }
  assert.deepEqual(normalizeFactDeliveryError(new Error("socket exploded with details")), { status: "RETRYABLE", code: "TRANSPORT_FAILED" });
});
