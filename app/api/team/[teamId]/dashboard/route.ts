// app/api/team/[teamId]/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { getTeamDashboardStats } from "@/lib/services/articleManagementService";

export async function GET(
  req: NextRequest,
  // 👇 [수정됨] params의 타입을 Promise로 감싸주어야 합니다.
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const user = await requireUser();
    // 👇 params는 Promise이므로 await로 언래핑 (이미 잘 작성하셨습니다)
    const { teamId } = await params;

    const dashboard = await getTeamDashboardStats({
      teamId,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      stats: dashboard.stats,
      recent: dashboard.recent,
    });
  } catch (e: any) {
    console.error("Team Dashboard Error:", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "팀 데이터를 불러오지 못했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
