// app/api/billing/subscription/schedule-downgrade/route.ts
import { NextResponse } from "next/server";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import {
  isPlanAvailableForPurchase,
  isPlanId,
  type PlanId,
} from "@/config/billing/plans";
import { apiError } from "@/lib/utils/api";
import { scheduleDowngradeForTeam } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    targetPlanId?: unknown;
    product?: unknown;
  };

  if (!isPlanId(body.targetPlanId)) {
    return NextResponse.json(
      apiError("INVALID_TARGET_PLAN", "INVALID_TARGET_PLAN", 400).body,
      { status: 400 }
    );
  }

  if (!isPlanAvailableForPurchase(body.targetPlanId)) {
    return NextResponse.json(
      apiError("PLAN_NOT_AVAILABLE", "PLAN_NOT_AVAILABLE", 400).body,
      { status: 400 }
    );
  }

  try {
    const product =
      body.product === "PRESS" || body.product === "CAREER" ? body.product : null;
    if (!product) {
      return NextResponse.json(
        apiError("PRODUCT_REQUIRED", "PRODUCT_REQUIRED", 400).body,
        { status: 400 }
      );
    }

    const { team, role } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }

    const updated = await scheduleDowngradeForTeam({
      teamId: team.id,
      targetPlanId: body.targetPlanId as PlanId,
      product,
    });

    return NextResponse.json({ ok: true, team: updated });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "INTERNAL_ERROR",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
