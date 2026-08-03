import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBillingCheckoutAbsoluteUrl,
  buildBillingCheckoutPath,
  parseBillingCheckoutRedirect,
} from "./billingCheckoutRedirect";

test("buildBillingCheckoutPath preserves plan, provider, mobile and coupon", () => {
  const path = buildBillingCheckoutPath({
    planId: "career_monthly",
    payProvider: "inicis",
    couponCode: "SPRING 2026",
    mobile: true,
  });

  assert.equal(
    path,
    "/billing/checkout?plan=career_monthly&provider=inicis&mobile=1&coupon=SPRING+2026"
  );
});

test("buildBillingCheckoutPath omits empty coupon and mobile flag by default", () => {
  const path = buildBillingCheckoutPath({
    planId: "press_monthly",
    payProvider: "kakaopay",
    couponCode: "   ",
  });

  assert.equal(path, "/billing/checkout?plan=press_monthly&provider=kakaopay");
});

test("buildBillingCheckoutAbsoluteUrl builds an absolute redirect url", () => {
  const url = buildBillingCheckoutAbsoluteUrl("https://presstuner.com", {
    planId: "career_monthly",
    payProvider: "inicis",
    mobile: true,
  });

  assert.equal(
    url,
    "https://presstuner.com/billing/checkout?plan=career_monthly&provider=inicis&mobile=1"
  );
});

test("parseBillingCheckoutRedirect extracts redirect results and metadata", () => {
  const result = parseBillingCheckoutRedirect(
    new URLSearchParams(
      "plan=career_monthly&provider=inicis&mobile=1&coupon=SPRING&billingKey=bk_test&pgCode=1234&message=ok"
    )
  );

  assert.deepEqual(result, {
    planId: "career_monthly",
    payProvider: "inicis",
    couponCode: "SPRING",
    mobile: true,
    billingKey: "bk_test",
    code: null,
    message: "ok",
    pgCode: "1234",
    pgMessage: null,
    hasResult: true,
  });
});

test("parseBillingCheckoutRedirect ignores unsupported providers", () => {
  const result = parseBillingCheckoutRedirect(
    new URLSearchParams("plan=career_monthly&provider=unknown")
  );

  assert.equal(result.planId, "career_monthly");
  assert.equal(result.payProvider, null);
  assert.equal(result.hasResult, false);
});
