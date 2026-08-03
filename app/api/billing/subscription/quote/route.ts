// app/api/billing/subscription/quote/route.ts
import { NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import {
  isPlanAvailableForPurchase,
  isPlanId,
  getPlanProduct,
  type PlanId,
} from "@/config/billing/plans";
import { apiError } from "@/lib/utils/api";
import { getSubscriptionQuoteForTeam } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { team, user } = await requireTeamContext();
    if (!team?.id) {
      const err = apiError("NO_TEAM", "NO_TEAM", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const url = new URL(req.url);
    const targetPlanId = url.searchParams.get("targetPlanId") ?? "";
    const couponCode = url.searchParams.get("couponCode") ?? "";
    const requestedProduct = url.searchParams.get("product");

    if (!isPlanId(targetPlanId)) {
      const err = apiError("INVALID_TARGET_PLAN", "INVALID_TARGET_PLAN", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    if (!isPlanAvailableForPurchase(targetPlanId)) {
      const err = apiError("PLAN_NOT_AVAILABLE", "PLAN_NOT_AVAILABLE", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const product = getPlanProduct(targetPlanId);
    if (!product || (requestedProduct && requestedProduct !== product)) {
      const err = apiError("PLAN_PRODUCT_MISMATCH", "PLAN_PRODUCT_MISMATCH", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const quote = await getSubscriptionQuoteForTeam({
      teamId: team.id,
      userId: user?.id ?? undefined,
      targetPlanId: targetPlanId as PlanId,
      couponCode,
    });

    return NextResponse.json({ ok: true, ...quote });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    }
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "INTERNAL_ERROR",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
