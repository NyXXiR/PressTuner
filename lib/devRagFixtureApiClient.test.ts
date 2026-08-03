import assert from "node:assert/strict";
import test from "node:test";

import {
  createDevRagFixtureApiClient,
  DevRagFixtureApiError,
  type DevRagFixtureExchange,
} from "./devRagFixtureApiClient";

const state = {
  domain: "PRESS",
  mounted: true,
  changed: true,
  fixtureVersion: "press-v1",
  summary: "QA fixture",
  scope: { kind: "TEAM", id: "team-1" },
  resourceVersion: 2,
} as const;

test("GET is uncached and PUT sends only the mounted boolean per domain", async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const client = createDevRagFixtureApiClient({
    fetch: async (input, init) => {
      requests.push({ path: String(input), init });
      const domain = String(input).endsWith("/resume") ? "RESUME" : "PRESS";
      return new Response(
        JSON.stringify(
          init?.method === "GET"
            ? { ok: true, fixtures: [state] }
            : {
                ok: true,
                fixture: {
                  ...state,
                  domain,
                  scope:
                    domain === "PRESS"
                      ? state.scope
                      : { kind: "USER", id: "user-1" },
                },
              },
        ),
      );
    },
  });
  await client.read();
  await client.setMounted("PRESS", true);
  await client.setMounted("RESUME", false);
  assert.equal(requests[0].init?.cache, "no-store");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    mounted: true,
  });
  assert.equal(requests[1].path.endsWith("/press"), true);
  assert.equal(requests[2].path.endsWith("/resume"), true);
});
test("observations redact sensitive request and response keys", async () => {
  const exchanges: DevRagFixtureExchange[] = [];
  const client = createDevRagFixtureApiClient({
    fetch: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          fixtures: [{ ...state, token: "secret", nested: { cookie: "sid" } }],
        }),
      ),
    onExchange: (exchange) => exchanges.push(exchange),
  });
  await client.read();
  const response = exchanges[0].response as any;
  assert.equal(response.fixtures[0].token, "[REDACTED]");
  assert.equal(response.fixtures[0].nested.cookie, "[REDACTED]");
});

test("network, non-2xx, and malformed successes are inspectable errors", async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error("offline secret");
    },
    async () =>
      new Response(JSON.stringify({ error: "FORBIDDEN", message: "no" }), {
        status: 403,
      }),
    async () => new Response(JSON.stringify({ ok: true, fixtures: "bad" })),
  ]) {
    const client = createDevRagFixtureApiClient({
      fetch: fetchImpl as typeof fetch,
    });
    await assert.rejects(client.read(), (error: unknown) => {
      assert.ok(error instanceof DevRagFixtureApiError);
      assert.ok(error.exchange);
      return true;
    });
  }
});

test("observer failures do not alter successful requests", async () => {
  const client = createDevRagFixtureApiClient({
    fetch: async () =>
      new Response(JSON.stringify({ ok: true, fixtures: [state] })),
    onExchange: () => {
      throw new Error("observer failed");
    },
  });
  assert.equal((await client.read())[0].mounted, true);
});
