import assert from "node:assert/strict";
import test from "node:test";
import { signAiProcessRequest } from "@/lib/services/ai-process-console/requestAuthentication";
import { createAiProcessTestRunPostHandler } from "@/lib/services/ai-process-console/adapterRoutes.server";

const pathname = "/api/internal/ai-process-console/v1/test-runs";
const clock = () => new Date("2030-01-01T00:05:00.000Z");
const settings = {
  destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const,
  destinationUrl: new URL("https://configured.example.test/facts"),
  inboundHmacSecret: "i".repeat(32), outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 3000,
  authMaxSkewSeconds: 300, flushBatchSize: 50, deliveredRetentionDays: 30, retentionBatchSize: 250, pendingDegradedAfterSeconds: 900,
};
const configuration = { status: "VALID" as const, code: "VALID" as const, settings };

function request(body: string, options: { contentType?: string; signature?: string; url?: string } = {}) {
  const auth = signAiProcessRequest({ secret: settings.inboundHmacSecret, timestamp: "1893456300", method: "POST", pathname, body });
  return new Request(options.url ?? `https://app.example.test${pathname}`, { method: "POST", headers: { "content-type": options.contentType ?? "application/json", "x-ai-process-timestamp": auth.timestamp, "x-ai-process-signature": options.signature ?? auth.signature }, body });
}

test("route authenticates exact raw JSON before parsing and delegates the unchanged value", async () => {
  const raw = "{\n  \"command\": \"exact\"\n}";
  let handled: unknown;
  let transportSettings: unknown;
  const post = createAiProcessTestRunPostHandler({
    loadConfiguration: () => configuration,
    clock,
    createTransport: (received) => { transportSettings = received; return { deliver: async () => ({ status: "DELIVERED" }) }; },
    createService: ({ transport }) => ({ handle: async (value) => { assert.ok(transport); handled = value; return { status: "REJECTED", testRunId: "unresolved", rejectionCode: "REQUEST_INVALID" }; } }),
  });
  const response = await post(request(raw));
  assert.equal(response.status, 200);
  assert.deepEqual(handled, JSON.parse(raw));
  assert.equal(transportSettings, settings);
});

test("bad authentication masks malformed JSON, while authenticated malformed JSON is rejected", async () => {
  let calls = 0;
  const post = createAiProcessTestRunPostHandler({ loadConfiguration: () => configuration, clock, createService: () => ({ handle: async () => { calls += 1; return { status: "REJECTED", testRunId: "never", rejectionCode: "REQUEST_INVALID" }; } }) });
  assert.deepEqual(await (await post(request("{", { signature: `v1=${"0".repeat(64)}` }))).json(), { code: "REQUEST_AUTHENTICATION_FAILED" });
  const malformed = await post(request("{"));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { code: "REQUEST_INVALID" });
  assert.equal(calls, 0);
});

test("route enforces configuration, query, media, and 64 KiB boundaries", async () => {
  const unavailable = createAiProcessTestRunPostHandler({ loadConfiguration: () => ({ status: "DISABLED", code: "DISABLED" }) });
  assert.equal((await unavailable(request("{}"))).status, 503);
  const post = createAiProcessTestRunPostHandler({ loadConfiguration: () => configuration, clock });
  assert.equal((await post(request("{}", { url: `https://app.example.test${pathname}?unsafe=1` }))).status, 400);
  assert.equal((await post(request("{}", { contentType: "text/plain" }))).status, 415);
  assert.equal((await post(request(JSON.stringify({ value: "x".repeat(65_536) })))).status, 413);
});

test("caller control fields never configure transport and remain subject to strict service rejection", async () => {
  const body = JSON.stringify({ destinationId: "caller", destinationUrl: "https://attacker.invalid", handler: "x", node: "x", transition: "x", fixtureText: "secret", mutation: "production" });
  let receivedSettings: unknown;
  const post = createAiProcessTestRunPostHandler({
    loadConfiguration: () => configuration, clock,
    createTransport: (received) => { receivedSettings = received; return { deliver: async () => ({ status: "DELIVERED" }) }; },
    createService: () => ({ handle: async () => ({ status: "REJECTED", testRunId: "unresolved", rejectionCode: "REQUEST_INVALID" }) }),
  });
  const response = await post(request(body));
  assert.equal(response.status, 200);
  assert.equal(receivedSettings, settings);
});

test("command reuse conflicts and unexpected failures use bounded responses", async () => {
  const conflict = createAiProcessTestRunPostHandler({ loadConfiguration: () => configuration, clock, createService: () => ({ handle: async () => { throw new Error("AI_PROCESS_COMMAND_REUSE_CONFLICT"); } }) });
  const failed = createAiProcessTestRunPostHandler({ loadConfiguration: () => configuration, clock, createService: () => ({ handle: async () => { throw new Error("database secret detail"); } }) });
  assert.deepEqual(await (await conflict(request("{}"))).json(), { code: "COMMAND_REUSE_CONFLICT" });
  const response = await failed(request("{}"));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { code: "TEST_RUN_REQUEST_FAILED" });
});
