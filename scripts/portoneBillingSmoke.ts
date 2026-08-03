import "dotenv/config";

import { issueBillingKeyWithCard } from "@/domain/billing/portone/issueBillingKeyWithCard";
import { payWithBillingKey } from "@/domain/billing/subscription/portone";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`MISSING_ENV:${name}`);
  }
  return value;
}

function readAmountWon() {
  const raw = process.env.PORTONE_SMOKE_AMOUNT_WON?.trim() || "100";
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_ENV:PORTONE_SMOKE_AMOUNT_WON");
  }
  return Math.round(amount);
}

async function main() {
  const customerName =
    process.env.PORTONE_SMOKE_CUSTOMER_NAME?.trim() ||
    process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_NAME?.trim() ||
    "테스트 사용자";
  const customerEmail =
    process.env.PORTONE_SMOKE_CUSTOMER_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_EMAIL?.trim() ||
    "test@test.com";
  const customerPhoneNumber =
    process.env.PORTONE_SMOKE_CUSTOMER_PHONE?.trim() ||
    process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_PHONE?.trim() ||
    "01000000000";

  const issued = await issueBillingKeyWithCard({
    customerId: `smoke_${Date.now()}`,
    customerName,
    customerEmail,
    customerPhoneNumber,
    cardNumber: requireEnv("NEXT_PUBLIC_PORTONE_TEST_CARD_NUMBER"),
    expiryMonth: requireEnv("NEXT_PUBLIC_PORTONE_TEST_EXPIRY_MM"),
    expiryYear: requireEnv("NEXT_PUBLIC_PORTONE_TEST_EXPIRY_YY"),
    birthOrBizNo: requireEnv("NEXT_PUBLIC_PORTONE_TEST_BIRTH_OR_BIZ"),
    passwordTwoDigits: requireEnv("PORTONE_SMOKE_PASSWORD_TWO_DIGITS"),
  });

  const paymentId = `smoke_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const paid = await payWithBillingKey({
    payProvider: "inicis",
    billingKey: issued.billingKey,
    orderName:
      process.env.PORTONE_SMOKE_ORDER_NAME?.trim() ||
      "PressTuner PortOne billing smoke test",
    amountWon: readAmountWon(),
    customer: issued.customer,
    customData: {
      kind: "PORTONE_SMOKE_TEST",
      source: "scripts/portoneBillingSmoke.ts",
    },
    attemptId: crypto.randomUUID(),
    paymentId,
  });

  if (!paid.ok) {
    throw new Error(`PORTONE_SMOKE_PAYMENT_FAILED:${paid.error}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        paymentId,
        billingKey: issued.billingKey,
        payment: paid.data,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
