import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { listTeamArticlesByTeamId } from "@/lib/services/articleManagementService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const user = await requireUser();
    const { teamId } = await params;
    const { searchParams } = new URL(req.url);

    // 1. 파라미터 파싱
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(searchParams.get("pageSize") || "20");
    const q = searchParams.get("q") || "";
    const statusParams = searchParams.getAll("status"); // ?status=FINAL&status=IN_PROGRESS
    const period = searchParams.get("period"); // 'current_month'

    const { total, items } = await listTeamArticlesByTeamId({
      teamId,
      userId: user.id,
      page,
      pageSize,
      q,
      statusParams,
      period,
    });

    return NextResponse.json({
      ok: true,
      list: items,
      total,
      totalPages: Math.ceil(total / pageSize),
      page,
      pageSize,
    });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "Internal Server Error", status).body,
      { status }
    );
  }
}
