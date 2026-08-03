import { NextResponse } from "next/server";

import { getCheckoutIntentStatus } from "@/domain/billing/checkoutIntentService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  try {
    const intent = await getCheckoutIntentStatus(token ?? "");
    return NextResponse.json({ ok: true, intent });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      "CHECKOUT_INTENT_STATUS_FAILED",
      error?.message ?? "CHECKOUT_INTENT_STATUS_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

