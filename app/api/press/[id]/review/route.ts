import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUserId } from "@/lib/auth";
import { reviewLegacyPressArticle } from "@/lib/services/pressReviewService";
import { apiError } from "@/lib/utils/api";

type RouteContext = { params: Promise<{ id: string }> };
type ReviewBody = { title?: string; plain: string };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 },
      );
    }
    const body = (await req.json()) as ReviewBody;
    const result = await reviewLegacyPressArticle({
      articleId: id,
      userId: currentUserId,
      title: body.title ?? "",
      plain: body.plain ?? "",
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error(error);
    const serviceFailure = error as {
      status?: number;
      code?: string;
      message?: string;
      details?: unknown;
    };
    const status = serviceFailure.status ?? 500;
    return NextResponse.json(
      apiError(
        serviceFailure.code ?? "REVIEW_FAILED",
        serviceFailure.message ?? "검수 중 오류가 발생했습니다.",
        status,
        serviceFailure.details
          ? { details: serviceFailure.details }
          : undefined,
      ).body,
      { status },
    );
  }
}
