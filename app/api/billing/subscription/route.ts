// app/api/billing/subscription/route.ts
import { NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { getSubscriptionStatusForTeamByProduct } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { team } = await requireTeamContext();
    if (!team?.id) {
      const err = apiError("NO_TEAM", "NO_TEAM", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const url = new URL(req.url);
    const product =
      url.searchParams.get("product") === "PRESS"
        ? "PRESS"
        : url.searchParams.get("product") === "CAREER"
          ? "CAREER"
          : null;
    if (!product) {
      const err = apiError("PRODUCT_REQUIRED", "PRODUCT_REQUIRED", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const status = await getSubscriptionStatusForTeamByProduct(team.id, product);

    return NextResponse.json({ ok: true, team: status });
  } catch (e: any) {
    const s = typeof e?.status === "number" ? e.status : 500;
    if (s === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    }
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "INTERNAL_ERROR",
      s
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
