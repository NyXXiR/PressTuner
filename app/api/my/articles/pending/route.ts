// app/api/my/articles/pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { ArticleType, ReviewAssignmentStatus } from "@prisma/client";
import { apiError } from "@/lib/utils/api";
import { listReviewAssignmentsForUser } from "@/lib/services/reviewAssignmentService";

function parseListParams(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? 10))
  );

  const q = url.searchParams.get("q") ?? undefined;

  const typeParam = url.searchParams.get("type") ?? "";
  const type = typeParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as (keyof typeof ArticleType)[];

  const mode = (url.searchParams.get("mode") ?? "received") as
    | "received"
    | "sent";

  const reviewStatusParam = url.searchParams.get("reviewStatus") ?? "";
  const reviewStatus = reviewStatusParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as (keyof typeof ReviewAssignmentStatus)[];

  return { page, pageSize, q, type, mode, reviewStatus };
}

export async function GET(req: NextRequest) {
  try {
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    const { page, pageSize, q, type, mode, reviewStatus } =
      parseListParams(req);

    const { total, items } = await listReviewAssignmentsForUser({
      userId: currentUserId,
      mode,
      q,
      type,
      reviewStatus,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      ok: true,
      page,
      pageSize,
      total,
      totalPages,
      items,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}
