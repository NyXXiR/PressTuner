import test from "node:test";
import assert from "node:assert/strict";

import { getTrustedAppUrl } from "@/config/billing/portone.server";
import { prepareBillingKeyIssue } from "./prepareBillingKeyIssue";

function withEnv(values: Record<string, string>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("prepareBillingKeyIssue builds a mobile checkout redirect url with coupon context", () => {
  withEnv(
    {
      PORTONE_STORE_ID: "store-test",
      PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
    },
    () => {
      const prepared = prepareBillingKeyIssue({
        planId: "career_pro_v1",
        payProvider: "inicis",
        couponCode: "SPRING 2026",
        mobile: true,
        appUrl: "https://presstuner.com",
      });

      assert.equal(prepared.ok, true);
      assert.equal(
        prepared.redirectUrl,
        "https://presstuner.com/billing/checkout?plan=career_pro_v1&provider=inicis&mobile=1&coupon=SPRING+2026",
      );
      assert.deepEqual(prepared.windowType, {
        pc: "IFRAME",
        mobile: "REDIRECTION",
      });
      assert.equal(prepared.billingKeyMethod, "CARD");
    },
  );
});

test("prepareBillingKeyIssue uses easy-pay mode for kakaopay and omits blank coupon", () => {
  withEnv(
    {
      PORTONE_STORE_ID: "store-test",
      PORTONE_CHANNEL_KEY_KAKAOPAY: "channel-key-kakaopay",
    },
    () => {
      const prepared = prepareBillingKeyIssue({
        planId: "basic_monthly_v1",
        payProvider: "kakaopay",
        couponCode: "   ",
        appUrl: "https://presstuner.com",
      });

      assert.equal(
        prepared.redirectUrl,
        "https://presstuner.com/billing/checkout?plan=basic_monthly_v1&provider=kakaopay",
      );
      assert.equal(prepared.billingKeyMethod, "EASY_PAY");
    },
  );
});

test("prepareBillingKeyIssue respects an explicit redirect override", () => {
  withEnv(
    {
      PORTONE_STORE_ID: "store-test",
      PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
    },
    () => {
      const prepared = prepareBillingKeyIssue({
        planId: "career_pro_v1",
        payProvider: "inicis",
        appUrl: "https://presstuner.com",
        redirectUrlOverride:
          "https://presstuner.com/checkout/mobile?intent=abc123",
      });

      assert.equal(
        prepared.redirectUrl,
        "https://presstuner.com/checkout/mobile?intent=abc123",
      );
    },
  );
});

test("getTrustedAppUrl ignores request origin headers in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://app.presstuner.com",
    },
    () => {
      const req = new Request("https://internal.example/api/billing", {
        headers: {
          origin: "https://evil.example",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "evil-forwarded.example",
        },
      });

      assert.equal(getTrustedAppUrl(req), "https://app.presstuner.com");
    },
  );
});
