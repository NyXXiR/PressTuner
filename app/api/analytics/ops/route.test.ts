import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { POST } from "./route";

const ENVIRONMENT_KEYS = [
  "OPS_CONSOLE_URL",
  "OPS_CONSOLE_ANALYTICS_WRITE_KEY",
  "OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY",
  "OPS_CONSOLE_ANALYTICS_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
] as const;
const originalEnvironment = Object.fromEntries(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;

const request = (body: string) => new Request("https://app.example.test/api/analytics/ops", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});

const validBody = JSON.stringify({
  events: [{ event: "resume_pdf_opened", properties: { source: "resume_builder" } }],
});

function configure() {
  process.env.OPS_CONSOLE_URL = "https://ops.example.test/root/";
  process.env.OPS_CONSOLE_ANALYTICS_WRITE_KEY = "analytics-write-key";
  process.env.OPS_CONSOLE_ANALYTICS_ORIGIN = "https://app.example.test";
}

beforeEach(() => {
  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
  globalThis.fetch = async () => { throw new Error("unexpected fetch"); };
});

afterEach(() => {
  for (const key of ENVIRONMENT_KEYS) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

test("client payload validation returns 400 before analytics configuration lookup", async () => {
  const invalidJson = await POST(request("{"));
  assert.equal(invalidJson.status, 400);
  assert.deepEqual(await invalidJson.json(), { ok: false, error: "invalid_json" });

  const invalidShape = await POST(request(JSON.stringify({ events: "not-an-array" })));
  assert.equal(invalidShape.status, 400);
  assert.deepEqual(await invalidShape.json(), { ok: false, error: "validation_error" });
});

test("oversized client payloads retain the 413 response", async () => {
  const response = await POST(request(JSON.stringify({ events: ["x".repeat(128 * 1024)] })));

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { ok: false, error: "payload_too_large" });
});

test("valid analytics payload succeeds when upstream configuration is missing", async () => {
  const response = await POST(request(validBody));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
});

test("valid analytics payload succeeds when upstream delivery throws", async () => {
  configure();
  globalThis.fetch = async () => { throw new Error("network unavailable"); };

  const response = await POST(request(validBody));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
});

test("valid analytics payload succeeds for an upstream 404 with a non-JSON response", async () => {
  configure();
  globalThis.fetch = async () => new Response("not found", { status: 404 });

  const response = await POST(request(validBody));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
});

test("valid analytics payload is forwarded to the canonical upstream endpoint", async () => {
  configure();
  let forwardedUrl = "";
  let forwardedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    forwardedUrl = String(input);
    forwardedInit = init;
    return new Response(JSON.stringify({ accepted: true }), { status: 200 });
  };

  const response = await POST(request(validBody));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(forwardedUrl, "https://ops.example.test/root/api/analytics/v1/events");
  assert.equal(forwardedInit?.method, "POST");
  assert.equal(forwardedInit?.cache, "no-store");
  const headers = new Headers(forwardedInit?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("origin"), "https://app.example.test");
  assert.deepEqual(JSON.parse(String(forwardedInit?.body)), {
    writeKey: "analytics-write-key",
    events: [{ event: "resume_pdf_opened", properties: { source: "resume_builder" } }],
  });
});
