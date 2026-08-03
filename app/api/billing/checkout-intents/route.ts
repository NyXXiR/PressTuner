import { NextResponse } from "next/server";

import { isPayProvider } from "@/config/billing/options";
import { getPlanProduct, isPlanAvailableForPurchase, isPlanId } from "@/config/billing/plans";
import { createCheckoutIntent } from "@/domain/billing/checkoutIntentService";
import { apiError } from "@/lib/utils/api";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import { getTrustedAppUrl } from "@/config/billing/portone.server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    planId?: unknown;
    payProvider?: unknown;
    couponCode?: unknown;
    product?: unknown;
  };

  if (!isPlanId(body.planId)) {
    return NextResponse.json(
      apiError("INVALID_PLAN", "INVALID_PLAN", 400).body,
      { status: 400 },
    );
  }

  if (!isPlanAvailableForPurchase(body.planId)) {
    return NextResponse.json(
      apiError("PLAN_NOT_AVAILABLE", "PLAN_NOT_AVAILABLE", 400).body,
      { status: 400 },
    );
  }

  const product = getPlanProduct(body.planId);
  if (!product || (body.product != null && body.product !== product)) {
    return NextResponse.json(
      apiError("PLAN_PRODUCT_MISMATCH", "PLAN_PRODUCT_MISMATCH", 400).body,
      { status: 400 },
    );
  }

  if (!isPayProvider(body.payProvider)) {
    return NextResponse.json(
      apiError("INVALID_PAY_PROVIDER", "INVALID_PAY_PROVIDER", 400).body,
      { status: 400 },
    );
  }

  try {
    const { team, user, role } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 },
      );
    }

    const created = await createCheckoutIntent({
      teamId: team.id,
      userId: user.id,
      planId: body.planId,
      payProvider: body.payProvider,
      couponCode:
        typeof body.couponCode === "string" ? body.couponCode : null,
      appUrl: getTrustedAppUrl(req),
    });

    return NextResponse.json({ ok: true, ...created });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      "CHECKOUT_INTENT_CREATE_FAILED",
      error?.message ?? "CHECKOUT_INTENT_CREATE_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
