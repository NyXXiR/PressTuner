import { NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { getArticleForUser } from "@/lib/services/articleManagementService";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  try {
    const userId = await requireCurrentUserId();

    const { article, usage } = await getArticleForUser({
      articleId: id,
      userId,
    });

    return NextResponse.json({ ok: true, id, articleId: id, article, usage });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "GET_ERROR",
      e?.message ?? "Failed to load article",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
