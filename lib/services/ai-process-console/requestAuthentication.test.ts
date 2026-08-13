import assert from "node:assert/strict";
import test from "node:test";
import { signAiProcessRequest, verifyAiProcessRequest } from "./requestAuthentication";

const secret = "inbound-secret-that-is-at-least-32-bytes";
const otherSecret = "outbound-secret-that-is-at-least-32-byte";
const now = () => new Date("2030-01-01T00:05:00.000Z");

function signed(overrides: Partial<Parameters<typeof signAiProcessRequest>[0]> = {}) {
  return signAiProcessRequest({ secret, timestamp: "1893456300", method: "POST", pathname: "/api/internal/ai-process-console/v1/test-runs", body: "{\"exact\":true}", ...overrides });
}

test("valid exact request bytes authenticate with an injected clock", () => {
  const signature = signed();
  assert.equal(verifyAiProcessRequest({ secret, timestamp: signature.timestamp, signature: signature.signature, method: "POST", pathname: "/api/internal/ai-process-console/v1/test-runs", body: "{\"exact\":true}", maxSkewSeconds: 300, clock: now }), true);
});

test("body, method, path, timestamp, and directional key tampering fail", () => {
  const signature = signed();
  const base = { secret, timestamp: signature.timestamp, signature: signature.signature, method: "POST", pathname: "/api/internal/ai-process-console/v1/test-runs", body: "{\"exact\":true}", maxSkewSeconds: 300, clock: now };
  assert.equal(verifyAiProcessRequest({ ...base, body: "{\"exact\":false}" }), false);
  assert.equal(verifyAiProcessRequest({ ...base, method: "GET" }), false);
  assert.equal(verifyAiProcessRequest({ ...base, pathname: "/api/internal/ai-process-console/v1/health" }), false);
  assert.equal(verifyAiProcessRequest({ ...base, timestamp: "1893456299" }), false);
  assert.equal(verifyAiProcessRequest({ ...base, secret: otherSecret }), false);
});

test("stale, future, malformed timestamp and signature inputs fail", () => {
  for (const timestamp of ["1893455999", "1893456601", "-1", "+1", "01", "1.5", "", "999999999999999999999"]) {
    const signature = signed({ timestamp });
    assert.equal(verifyAiProcessRequest({ secret, timestamp, signature: signature.signature, method: "POST", pathname: "/api/internal/ai-process-console/v1/test-runs", body: "{\"exact\":true}", maxSkewSeconds: 300, clock: now }), false);
  }
  for (const signature of ["", "v2=" + "0".repeat(64), "v1=ABC", "v1=" + "0".repeat(63), "v1=" + "g".repeat(64)]) {
    assert.equal(verifyAiProcessRequest({ secret, timestamp: "1893456300", signature, method: "POST", pathname: "/api/internal/ai-process-console/v1/test-runs", body: "{\"exact\":true}", maxSkewSeconds: 300, clock: now }), false);
  }
});

test("GET health signs an exact empty body", () => {
  const signedHealth = signAiProcessRequest({ secret, timestamp: "1893456300", method: "get", pathname: "/api/internal/ai-process-console/v1/health", body: "" });
  assert.equal(verifyAiProcessRequest({ secret, ...signedHealth, method: "GET", pathname: "/api/internal/ai-process-console/v1/health", body: new Uint8Array(), maxSkewSeconds: 300, clock: now }), true);
});

test("documented interoperability vector remains stable", () => {
  assert.deepEqual(signAiProcessRequest({
    secret: "0123456789abcdef0123456789abcdef",
    timestamp: "1893456300",
    method: "GET",
    pathname: "/api/internal/ai-process-console/v1/health",
    body: "",
  }), {
    timestamp: "1893456300",
    signature: "v1=ba107166fa8d33a60ef20e007df9b41f48505fb5afba3b22dbdfe136bd8a8a7f",
  });
});
