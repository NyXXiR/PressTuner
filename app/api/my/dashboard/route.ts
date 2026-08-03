import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { getMyDashboardSummary } from "@/lib/services/myDashboardService";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const dashboard = await getMyDashboardSummary(user.id);

    return NextResponse.json({
      ok: true,
      ...dashboard,
    });
  } catch (e: any) {
    console.error("My Dashboard Error:", e);
    const status = e?.status || 500;
    const err = apiError(
      "DASHBOARD_LOAD_FAILED",
      "대시보드 데이터를 불러오지 못했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
