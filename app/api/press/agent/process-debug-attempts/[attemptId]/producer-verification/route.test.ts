import assert from "node:assert/strict";
import test from "node:test";
import { createProducerVerificationRouteHandler } from "./route";

const context = { params: Promise.resolve({ attemptId: "attempt-private" }) };

test("verification GET authenticates first and forwards only team and attempt identity", async () => {
  const calls: unknown[] = [];
  const handler = createProducerVerificationRouteHandler({
    requireTeamContext: async () => ({ team: { id: "team-private" } }) as never,
    getVerification: async (args) => { calls.push(args); return { schemaVersion: "presstuner/producer-verification/v1" } as never; },
  });
  const response = await handler(new Request("https://example.test"), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [{ teamId: "team-private", attemptId: "attempt-private" }]);
  assert.deepEqual(await response.json(), { verification: { schemaVersion: "presstuner/producer-verification/v1" } });
});

test("authentication failure prevents service invocation", async () => {
  let invoked = false;
  const handler = createProducerVerificationRouteHandler({
    requireTeamContext: async () => { throw Object.assign(new Error("raw auth text"), { status: 401 }); },
    getVerification: async () => { invoked = true; throw new Error("must not run"); },
  });
  const response = await handler(new Request("https://example.test"), context);
  assert.equal(invoked, false);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "PRESS_AI_PRODUCER_VERIFICATION_UNAUTHENTICATED" });
});

test("authorization failures are mapped without exposing their messages", async () => {
  const handler = createProducerVerificationRouteHandler({
    requireTeamContext: async () => { throw Object.assign(new Error("private membership details"), { status: 403 }); },
    getVerification: async () => { throw new Error("must not run"); },
  });
  const response = await handler(new Request("https://example.test"), context);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "PRESS_AI_PRODUCER_VERIFICATION_FORBIDDEN" });
});

test("not found is anti-enumerating and unexpected failures are sanitized", async () => {
  for (const [status, expected] of [[404, "PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND"], [500, "PRESS_AI_PRODUCER_VERIFICATION_FAILED"]] as const) {
    const handler = createProducerVerificationRouteHandler({
      requireTeamContext: async () => ({ team: { id: "team" } }) as never,
      getVerification: async () => { throw Object.assign(new Error("DATABASE_URL=secret raw failure"), status === 404 ? { status } : {}); },
    });
    const response = await handler(new Request("https://example.test"), context);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = JSON.stringify(await response.json());
    assert.equal(body, JSON.stringify({ code: expected }));
    assert.doesNotMatch(body, /DATABASE_URL|secret|raw failure/);
  }
});
