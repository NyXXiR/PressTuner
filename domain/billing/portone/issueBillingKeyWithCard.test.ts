import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInicisBillingKeyIssueBody,
  extractBillingKey,
  issueBillingKeyWithCard,
  normalizeExpiryMonth,
  normalizeExpiryYear,
  onlyDigits,
} from "./issueBillingKeyWithCard";

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

test("issueBillingKeyWithCard normalizes payload for PortOne billing-keys API", async () => {
  await withEnv(
    {
      PORTONE_STORE_ID: "store-test",
      PORTONE_API_SECRET: "secret-test",
      PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
    },
    async () => {
      const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
      const originalFetch = global.fetch;

      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchCalls.push({ url: String(input), init });
        return {
          ok: true,
          json: async () => ({
            billingKeyInfo: { billingKey: "billing-key-test" },
          }),
        } as Response;
      }) as FetchMock;

      try {
        const result = await issueBillingKeyWithCard({
          customerId: "team_1",
          customerName: "홍길동",
          customerEmail: "hong@example.com",
          customerPhoneNumber: "010-1234-5678",
          cardNumber: "4330-1234-1234-1234",
          expiryYear: "2028",
          expiryMonth: "3",
          birthOrBizNo: "900101",
          passwordTwoDigits: "12",
        });

        assert.equal(result.billingKey, "billing-key-test");
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0]?.url, "https://api.portone.io/billing-keys");
        assert.equal(fetchCalls[0]?.init?.method, "POST");

        const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
        assert.equal(headers.Authorization, "PortOne secret-test");
        assert.match(headers["Idempotency-Key"], /^".+"$/);

        const payload = JSON.parse(String(fetchCalls[0]?.init?.body));
        assert.deepEqual(payload, {
          storeId: "store-test",
          channelKey: "channel-key-inicis",
          customer: {
            id: "team_1",
            name: { full: "홍길동" },
            email: "hong@example.com",
            phoneNumber: "01012345678",
          },
          method: {
            card: {
              credential: {
                number: "4330123412341234",
                expiryYear: "28",
                expiryMonth: "03",
                birthOrBusinessRegistrationNumber: "900101",
                passwordTwoDigits: "12",
              },
            },
          },
        });
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});

test("issueBillingKeyWithCard rejects invalid card input before calling PortOne", async () => {
  await withEnv(
    {
      PORTONE_STORE_ID: "store-test",
      PORTONE_API_SECRET: "secret-test",
      PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
    },
    async () => {
      await assert.rejects(
        () =>
          issueBillingKeyWithCard({
            cardNumber: "4330-1234-1234-1234",
            expiryYear: "2028",
            expiryMonth: "13",
            birthOrBizNo: "900101",
            passwordTwoDigits: "1",
          }),
        (error: any) => {
          assert.equal(error?.status, 400);
          assert.equal(error?.code, "INVALID_INPUT");
          return true;
        },
      );
    },
  );
});

test("billing key helpers normalize expected card fields", () => {
  assert.equal(onlyDigits("010-1234-5678"), "01012345678");
  assert.equal(normalizeExpiryYear("2028"), "28");
  assert.equal(normalizeExpiryYear("28"), "28");
  assert.equal(normalizeExpiryMonth("3"), "03");
  assert.equal(normalizeExpiryMonth("13"), "");

  assert.deepEqual(
    buildInicisBillingKeyIssueBody({
      storeId: "store-id",
      channelKey: "channel-key",
      customerId: "cust-1",
      customerName: "테스트",
      customerEmail: "test@test.com",
      customerPhoneNumber: "01000000000",
      cardNumber: "4330123412341234",
      expiryYear: "28",
      expiryMonth: "03",
      birthOrBizNo: "900101",
      passwordTwoDigits: "12",
    }),
    {
      storeId: "store-id",
      channelKey: "channel-key",
      customer: {
        id: "cust-1",
        name: { full: "테스트" },
        email: "test@test.com",
        phoneNumber: "01000000000",
      },
      method: {
        card: {
          credential: {
            number: "4330123412341234",
            expiryYear: "28",
            expiryMonth: "03",
            birthOrBusinessRegistrationNumber: "900101",
            passwordTwoDigits: "12",
          },
        },
      },
    },
  );

  assert.equal(
    extractBillingKey({ billingKeyInfo: { billingKey: "billing-key-1" } }),
    "billing-key-1",
  );
  assert.equal(extractBillingKey({ billingKey: "billing-key-2" }), "billing-key-2");
  assert.equal(extractBillingKey({}), null);
});
