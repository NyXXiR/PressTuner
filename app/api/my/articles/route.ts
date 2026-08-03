import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { ArticleStatus, ArticleType } from "@prisma/client";
import { apiError } from "@/lib/utils/api";
import { listMyArticles } from "@/lib/services/articleManagementService";

function parseListParams(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? 10))
  );

  const q = url.searchParams.get("q") ?? undefined;

  const statusParam = url.searchParams.get("status") ?? ""; // "DRAFT,FINAL"
  const status = statusParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as (keyof typeof ArticleStatus)[];

  const typeParam = url.searchParams.get("type") ?? ""; // "PRESS_RELEASE,BLOG_POST"
  const type = typeParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as (keyof typeof ArticleType)[];

  // ✅ [추가] 기간 필터 파싱
  const period = url.searchParams.get("period");

  return { page, pageSize, q, status, type, period };
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

    const { page, pageSize, q, status, type, period } = parseListParams(req);

    const { total, items } = await listMyArticles({
      userId: currentUserId,
      page,
      pageSize,
      q,
      status,
      type,
      period,
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
      apiError("INTERNAL_ERROR", "서버 에러가 발생했습니다.", 500).body,
      { status: 500 }
    );
  }
}
