import { NextResponse } from "next/server";

import { getSubscriptionStatusForProduct } from "@/domain/billing/subscription/queries";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { team } = await requireTeamContext();
    const [press, career] = await Promise.all([
      getSubscriptionStatusForProduct(team.id, "PRESS"),
      getSubscriptionStatusForProduct(team.id, "CAREER"),
    ]);

    return NextResponse.json({
      ok: true,
      subscriptions: {
        PRESS: press,
        CAREER: career,
      },
    });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      error?.code ?? "SUBSCRIPTIONS_READ_FAILED",
      error?.message ?? "SUBSCRIPTIONS_READ_FAILED",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
