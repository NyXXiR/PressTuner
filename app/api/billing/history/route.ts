// app/api/billing/history/route.ts
import { NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { listBillingHistoryForTeam } from "@/lib/services/billing/historyService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { team } = await requireTeamContext();
    if (!team?.id) {
      const err = apiError("NO_TEAM", "NO_TEAM", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const productParam = url.searchParams.get("product");
    if (
      productParam !== null &&
      productParam !== "PRESS" &&
      productParam !== "CAREER"
    ) {
      const err = apiError("INVALID_PRODUCT", "INVALID_PRODUCT", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const items = await listBillingHistoryForTeam({
      teamId: team.id,
      product: productParam,
      startDate,
      endDate,
      monthsFallback: 3,
      take: 500,
    });

    return NextResponse.json({ ok: true, items });
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
