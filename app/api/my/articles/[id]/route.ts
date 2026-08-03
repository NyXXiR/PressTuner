// app/api/my/articles/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { deleteMyArticle } from "@/lib/services/articleManagementService";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    await deleteMyArticle({ articleId: id, userId: currentUserId });
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
