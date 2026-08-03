import { NextRequest, NextResponse } from "next/server";
import { requireSessionContext } from "@/lib/auth";
import { requestArticleApproval } from "@/lib/services/article/reviewUseCases";
import { ServiceError } from "@/lib/errors";
import { apiError } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

// Next.js 파라미터 타입 정의 (유연하게 처리)
type Ctx = { params: Promise<{ articleId?: string; id?: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { session } = await requireSessionContext();
    const requesterId = session.userId;

    // 1. URL 파라미터 파싱
    const params = await ctx.params;

    // ✅ [핵심 수정] 폴더명이 [id]인지 [articleId]인지 몰라도 동작하도록 둘 다 체크
    const articleId = params.articleId || params.id;

    // ID가 없으면 DB 호출 전에 미리 400 에러 처리 (500 에러 방지)
    if (!articleId) {
      throw new ServiceError(
        "INVALID_URL_PARAM",
        400,
        "URL에서 게시글 ID를 찾을 수 없습니다."
      );
    }

    const body = await req.json();
    const { targetUserId, message } = body;

    if (!targetUserId) {
      throw new ServiceError(
        "MISSING_FIELD",
        400,
        "대상 사용자(targetUserId)가 필요합니다."
      );
    }

    // 2. 서비스 호출
    await requestArticleApproval({
      articleId,
      requesterId,
      targetUserId,
      message,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        apiError(error.code, error.message, error.status, {
          details: error.data,
        }).body,
        { status: error.status }
      );
    }

    console.error("[Approval API Error]", error);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}
