import assert from "node:assert/strict";
import test from "node:test";
import { createResolvedFactFactory } from "@/domain/ai-process-console/v1/factEvents";
import { canonicalJson } from "@/domain/ai-process-console/v1/canonicalJson";
import { verifyAiProcessRequest } from "./requestAuthentication";
import { createHttpAiProcessFactTransport } from "./httpFactTransport.server";

const secret = "outbound-secret-that-is-at-least-32-bytes";
const clock = () => new Date("2030-01-01T00:05:00.000Z");
const factory = createResolvedFactFactory({ identity: { caseId: "case-http", objectType: "synthetic", operationId: "operation-http", attemptId: "attempt-http", correlationId: "correlation-http", testRunId: "test-run-http" }, clock });
const fact = factory.create({ type: "dev.aiprocess.event.attempt.started.v1", logicalKey: "started", sequence: 1, data: { attemptId: "attempt-http" } });

async function deliver(status: number, duplicate?: string) {
  let request: { input: string | URL | Request; init?: RequestInit } | undefined;
  const transport = createHttpAiProcessFactTransport({ destinationUrl: new URL("https://console.example.test/api/facts"), outboundHmacSecret: secret, timeoutMs: 3000, clock, fetch: async (input, init) => {
    request = { input, init };
    return new Response("body must be ignored", { status, headers: duplicate ? { "X-Ai-Process-Result-Code": duplicate } : undefined });
  } });
  const result = await transport.deliver(fact);
  return { result, request: request! };
}

test("transport emits canonical EventV1 bytes with exact outbound authentication", async () => {
  const { result, request } = await deliver(208);
  assert.deepEqual(result, { status: "DELIVERED" });
  assert.equal(String(request.input), "https://console.example.test/api/facts");
  assert.equal(request.init?.method, "POST");
  assert.equal(request.init?.redirect, "manual");
  assert.equal(request.init?.body, canonicalJson(fact));
  const headers = new Headers(request.init?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(verifyAiProcessRequest({ secret, timestamp: headers.get("x-ai-process-timestamp"), signature: headers.get("x-ai-process-signature"), method: "POST", pathname: "/api/facts", body: canonicalJson(fact), maxSkewSeconds: 300, clock }), true);
});

test("transport applies the complete bounded HTTP response table", async () => {
  const cases: Array<[number, string | undefined, unknown]> = [
    [200, undefined, { status: "DELIVERED" }], [299, undefined, { status: "DELIVERED" }],
    [409, "DUPLICATE_EVENT", { status: "DELIVERED" }],
    [401, undefined, { status: "PERMANENT", code: "AUTHENTICATION_FAILED" }], [403, undefined, { status: "PERMANENT", code: "AUTHENTICATION_FAILED" }],
    [400, undefined, { status: "PERMANENT", code: "CONTRACT_INVALID" }], [413, undefined, { status: "PERMANENT", code: "CONTRACT_INVALID" }], [415, undefined, { status: "PERMANENT", code: "CONTRACT_INVALID" }], [422, undefined, { status: "PERMANENT", code: "CONTRACT_INVALID" }],
    [409, undefined, { status: "PERMANENT", code: "SEQUENCE_CONFLICT" }], [409, "duplicate_event", { status: "PERMANENT", code: "SEQUENCE_CONFLICT" }],
    [408, undefined, { status: "RETRYABLE", code: "TRANSPORT_TIMEOUT" }],
    [425, undefined, { status: "RETRYABLE", code: "CONSOLE_THROTTLED" }], [429, undefined, { status: "RETRYABLE", code: "CONSOLE_THROTTLED" }],
    [500, undefined, { status: "RETRYABLE", code: "CONSOLE_UNAVAILABLE" }], [599, undefined, { status: "RETRYABLE", code: "CONSOLE_UNAVAILABLE" }],
    [302, undefined, { status: "PERMANENT", code: "HTTP_REJECTED" }], [418, undefined, { status: "PERMANENT", code: "HTTP_REJECTED" }],
  ];
  for (const [status, duplicate, expected] of cases) assert.deepEqual((await deliver(status, duplicate)).result, expected, `${status}/${duplicate}`);
});

test("network and abort failures become bounded retryable results", async () => {
  const network = createHttpAiProcessFactTransport({ destinationUrl: new URL("https://console.example.test/facts"), outboundHmacSecret: secret, timeoutMs: 3000, clock, fetch: async () => { throw new Error("private network detail"); } });
  assert.deepEqual(await network.deliver(fact), { status: "RETRYABLE", code: "TRANSPORT_FAILED" });
  const timeout = createHttpAiProcessFactTransport({ destinationUrl: new URL("https://console.example.test/facts"), outboundHmacSecret: secret, timeoutMs: 1, clock, fetch: async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  assert.deepEqual(await timeout.deliver(fact), { status: "RETRYABLE", code: "TRANSPORT_TIMEOUT" });
});
