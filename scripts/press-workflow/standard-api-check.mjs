// No provider calls: only authentication, request validation and stale-draft guards.
import assert from "node:assert/strict";

const base = "http://localhost:3003";
const endpoint = `${base}/api/articles/standard-evaluation-demo/quality-evaluation`;
const checks = [];
async function check(name, expected, headers = {}, body) {
  const response = await fetch(endpoint, {
    method: body === undefined ? "GET" : "POST", headers, body,
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, expected, `${name}: unexpected HTTP status`);
  checks.push({ name, status: response.status });
  return response;
}

await check("unauthenticated", 401);
const login = await fetch(`${base}/api/auth/dev/google-bypass?next=/press/standard-evaluation-demo/edit`, { redirect: "manual" });
assert.equal(login.status, 307);
const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie, "Use the isolated standard-demo server with the seeded development account");
const headers = { Cookie: cookie, Origin: base, "Content-Type": "application/json" };
const state = await (await check("authenticated availability", 200, { Cookie: cookie })).json();
assert.equal(state.runtimes.STANDARD.available, true);
assert.equal(state.runtimes.GEVAL.available, true);
assert.equal(state.inputReason, null);
assert.ok(Array.isArray(state.history));
assert.equal(state.contextCount, 3);
await check("cross-origin", 403, { ...headers, Origin: "https://example.invalid" }, "{}");
await check("malformed JSON", 422, headers, "{");
await check("untrusted browser context", 422, headers, JSON.stringify({ expectedOutput: "stale", contexts: ["invented context"] }));
await check("oversized request", 413, headers, "x".repeat(90001));
await check("stale draft", 409, headers, JSON.stringify({ kind: "STANDARD", idempotencyKey: "api-check-stale", expectedOutput: "intentionally stale synthetic input" }));
console.log(JSON.stringify({ providerCalls: 0, checks }, null, 2));
