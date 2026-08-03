import { NextResponse } from "next/server";

import { markCheckoutIntentFailed } from "@/domain/billing/checkoutIntentService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    message?: unknown;
  };

  try {
    const intent = await markCheckoutIntentFailed({
      token: typeof body.token === "string" ? body.token : "",
      message:
        typeof body.message === "string"
          ? body.message
          : "CHECKOUT_INTENT_FAILED",
    });
    return NextResponse.json({ ok: true, intent });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      "CHECKOUT_INTENT_FAIL_MARK_FAILED",
      error?.message ?? "CHECKOUT_INTENT_FAIL_MARK_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

