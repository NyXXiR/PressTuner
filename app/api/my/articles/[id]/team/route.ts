import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { updateMyArticleTeam } from "@/lib/services/articleManagementService";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    // body: { teamId: string | null }
    const body = await req.json().catch(() => null);
    const teamId = body?.teamId ?? null;

    if (teamId !== null && typeof teamId !== "string") {
      return NextResponse.json(
        apiError("INVALID_TEAM_ID", "teamId 형식이 올바르지 않습니다.", 400).body,
        { status: 400 }
      );
    }

    await updateMyArticleTeam({
      articleId: id,
      userId: currentUserId,
      teamId,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 에러가 발생했습니다.", status).body,
      { status }
    );
  }
}
