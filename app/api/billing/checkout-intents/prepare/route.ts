import { NextResponse } from "next/server";

import { getTrustedAppUrl } from "@/config/billing/portone.server";
import { prepareCheckoutIntentBillingKeyIssue } from "@/domain/billing/checkoutIntentService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
  };

  try {
    const prepared = await prepareCheckoutIntentBillingKeyIssue({
      token: typeof body.token === "string" ? body.token : "",
      appUrl: getTrustedAppUrl(req),
    });
    return NextResponse.json(prepared);
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      "CHECKOUT_INTENT_PREPARE_FAILED",
      error?.message ?? "CHECKOUT_INTENT_PREPARE_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
