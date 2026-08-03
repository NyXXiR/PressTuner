import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { listTeamArticlesForUser } from "@/lib/services/articleManagementService";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);

    // 1. 파라미터 파싱
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(searchParams.get("pageSize") || "20");
    const q = searchParams.get("q") || "";
    const statusParams = searchParams.get("status")
      ? searchParams.get("status")!.split(",")
      : [];
    const period = searchParams.get("period"); // 'current_month'

    const { teamId, total, items } = await listTeamArticlesForUser({
      userId: user.id,
      page,
      pageSize,
      q,
      statusParams,
      period,
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages: Math.ceil(total / pageSize),
      page,
      pageSize,
    });
  } catch (e: any) {
    console.error("Team Article List Error:", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "Internal Server Error",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
