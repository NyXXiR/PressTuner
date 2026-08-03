import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { getResumeDashboardStats } from "@/lib/services/resume/resumeDashboardService";

export async function GET(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const stats = await getResumeDashboardStats({
      userId: user.id,
      teamId: team.id,
    });

    return NextResponse.json({
      ok: true,
      stats,
    });
  } catch (error: any) {
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_DASHBOARD_FAILED",
      error?.message ?? "RESUME_DASHBOARD_FAILED",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
