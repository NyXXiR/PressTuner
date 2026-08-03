import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { listArticleGrounding } from "@/lib/services/article/articleGroundingService";
import { apiError } from "@/lib/utils/api";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const { id } = await context.params;
    return NextResponse.json({
      ok: true,
      ...(await listArticleGrounding({ teamId: team.id, articleId: id })),
    });
  } catch (error: any) {
    const status = error?.message === "ARTICLE_NOT_FOUND" ? 404 : 500;
    return NextResponse.json(
      apiError("ARTICLE_GROUNDING_READ_FAILED", error?.message, status).body,
      { status },
    );
  }
}
