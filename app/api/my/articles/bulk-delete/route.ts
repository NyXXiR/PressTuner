// app/api/my/articles/bulk-delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { bulkDeleteMyArticles } from "@/lib/services/articleManagementService";

export async function POST(req: NextRequest) {
  try {
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

    const res = await bulkDeleteMyArticles({
      userId: currentUserId,
      ids,
    });

    return NextResponse.json({
      ok: true,
      deletedCount: res.deletedCount,
      requested: res.requested,
    });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 에러가 발생했습니다.", status).body,
      { status }
    );
  }
}
