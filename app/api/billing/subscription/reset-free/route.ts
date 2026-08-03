// app/api/billing/subscription/reset-free/route.ts
import { NextResponse } from "next/server";
import { requireAdmin, requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { resetFreeForTeam } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";

/**
 * 운영자 전용: 팀 구독 정보를 FREE로 리셋
 * body: { confirm: "RESET_FREE" }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  const confirm = typeof body.confirm === "string" ? body.confirm : "";

  try {
    const { user } = await requireAdmin();

    // ✅ 팀 컨텍스트는 별도로 필요 (currentTeamId)
    const { team } = await requireTeamContext();
    if (!team?.id) {
      const err = apiError("NO_TEAM", "NO_TEAM", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const updated = await resetFreeForTeam({
      teamId: team.id,
      userId: user.id,
      confirm,
    });

    return NextResponse.json({ ok: true, team: updated });
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
