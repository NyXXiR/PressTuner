// app/api/press/[id]/finalize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { finalizePressArticle } from "@/lib/services/press/pressService";
import { mapPressFinalizationConflict } from "@/lib/services/press/pressFinalizationApi";
import { apiError } from "@/lib/utils/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );

    const result = await finalizePressArticle({
      userId: currentUserId,
      articleId: id,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const conflict = mapPressFinalizationConflict(e);
    if (conflict) {
      return NextResponse.json(
        apiError(conflict.code, conflict.message, conflict.status).body,
        { status: conflict.status },
      );
    }
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }
    if (status === 403) {
      return NextResponse.json(
        apiError("FORBIDDEN", "권한이 없습니다.", 403).body,
        { status: 403 }
      );
    }
    console.error(e);
    return NextResponse.json(
      apiError("FINALIZE_FAILED", "최종 확정 중 오류", 500).body,
      { status: 500 }
    );
  }
}
