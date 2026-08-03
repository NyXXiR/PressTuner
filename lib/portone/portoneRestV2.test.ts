import test from "node:test";
import assert from "node:assert/strict";

import { portonePostV2 } from "./portoneRestV2";

type FetchMock = typeof fetch;

function withEnv(values: Record<string, string>, fn: () => Promise<void> | void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    const out = fn();
    if (out && typeof (out as Promise<void>).finally === "function") {
      return (out as Promise<void>).finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

test("portonePostV2 sends PortOne auth and quoted idempotency key", async () => {
  await withEnv({ PORTONE_API_SECRET: "secret-test" }, async () => {
    const originalFetch = global.fetch;
    let request: { url?: string; init?: RequestInit } = {};

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      request = { url: String(input), init };
      return {
        ok: true,
        json: async () => ({ id: "payment-1", status: "PAID" }),
      } as Response;
    }) as FetchMock;

    try {
      const result = await portonePostV2<{ id: string }>(
        "/payments/payment-1/billing-key",
        {
        storeId: "store-1",
      },
        {
        idempotencyKey: "attempt-1",
        }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.id, "payment-1");
      }
      assert.equal(request.url, "https://api.portone.io/payments/payment-1/billing-key");
      assert.equal(request.init?.method, "POST");

      const headers = request.init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "PortOne secret-test");
      assert.equal(headers["content-type"], "application/json");
      assert.equal(headers["Idempotency-Key"], '"attempt-1"');
      assert.equal(request.init?.body, JSON.stringify({ storeId: "store-1" }));
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("portonePostV2 returns message from PortOne error payload", async () => {
  await withEnv({ PORTONE_API_SECRET: "secret-test" }, async () => {
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({ message: "BILLING_KEY_NOT_FOUND", type: "NotFoundError" }),
      } as Response;
    }) as FetchMock;

    try {
      const result = await portonePostV2("/payments/payment-1/billing-key", {
        storeId: "store-1",
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error, "BILLING_KEY_NOT_FOUND");
        assert.deepEqual(result.raw, {
          message: "BILLING_KEY_NOT_FOUND",
          type: "NotFoundError",
        });
      }
    } finally {
      global.fetch = originalFetch;
    }
  });
});
