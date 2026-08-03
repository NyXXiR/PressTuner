import { NextResponse } from "next/server";
import { requireSessionContext } from "@/lib/auth";
import { markNotificationAsRead } from "@/lib/services/notificationService";
import { ServiceError } from "@/lib/errors";
import { apiError, buildApiError } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, ctx: Ctx) {
  try {
    const { session } = await requireSessionContext();
    const params = await ctx.params;
    const id = params.id;

    if (!id) {
      const err = apiError("MISSING_ID", "id가 필요합니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    // 서비스 호출
    await markNotificationAsRead({
      notificationId: id,
      userId: session.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // [수정됨] ServiceError를 사용하여 에러 처리 단순화
    if (error instanceof ServiceError) {
      return NextResponse.json(
        buildApiError(error.code, error.message),
        { status: error.status }
      );
    }

    console.error("[Notification PATCH Error]", error);
    const err = apiError("INTERNAL_ERROR", "서버 내부 오류", 500);
    return NextResponse.json(err.body, { status: err.status });
  }
}
