import { NextResponse } from "next/server";

import { completeCheckoutIntentWithBillingKey } from "@/domain/billing/checkoutIntentService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    billingKey?: unknown;
    customer?: unknown;
  };

  const billingKey =
    typeof body.billingKey === "string" && body.billingKey.trim()
      ? body.billingKey.trim()
      : null;

  if (!billingKey) {
    return NextResponse.json(
      apiError("MISSING_BILLING_KEY", "MISSING_BILLING_KEY", 400).body,
      { status: 400 },
    );
  }

  try {
    const completed = await completeCheckoutIntentWithBillingKey({
      token: typeof body.token === "string" ? body.token : "",
      billingKey,
      customer: body.customer,
    });
    return NextResponse.json(completed);
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      "CHECKOUT_INTENT_COMPLETE_FAILED",
      error?.message ?? "CHECKOUT_INTENT_COMPLETE_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

