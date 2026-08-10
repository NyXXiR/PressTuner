// app/api/press/[id]/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { savePressArticle } from "@/lib/services/press/pressService";
import { apiError } from "@/lib/utils/api";
import { mapPressDomainConflict } from "@/lib/services/press/pressFinalizationApi";

type RouteContext = { params: Promise<{ id: string }> };

export function mapSavePressError(e: unknown) {
  const conflict = mapPressDomainConflict(e);
  if (conflict) {
    return NextResponse.json(
      apiError(conflict.code, conflict.message, conflict.status).body,
      { status: conflict.status },
    );
  }
  return null;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      lead,
      fact,
      paragraphs,
      closing,
      // 클라이언트에서 넘어온 신호는 그대로 저장만 하고,
      // 컴파일은 별도 엔드포인트에서 AI가 처리
      signals = [],
    } = body ?? {};

    const result = await savePressArticle({
      userId: currentUserId,
      articleId: id,
      title,
      lead,
      fact,
      paragraphs,
      closing,
      signals,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const conflictResponse = mapSavePressError(e);
    if (conflictResponse) return conflictResponse;
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }
    if (status === 403) {
      return NextResponse.json(
        apiError("FORBIDDEN", "수정 권한이 없습니다.", 403).body,
        { status: 403 }
      );
    }
    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 에러가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}
