import { NextResponse } from "next/server";

import { markCheckoutIntentOpened } from "@/domain/billing/checkoutIntentService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
  };

  try {
    const intent = await markCheckoutIntentOpened(
      typeof body.token === "string" ? body.token : "",
    );
    return NextResponse.json({ ok: true, intent });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      "CHECKOUT_INTENT_OPEN_FAILED",
      error?.message ?? "CHECKOUT_INTENT_OPEN_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

