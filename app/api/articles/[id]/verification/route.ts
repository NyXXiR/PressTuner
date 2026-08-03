import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getLatestArticleVerification,
  verifyArticle,
} from "@/lib/services/article/articleVerificationService";
import { apiError } from "@/lib/utils/api";

type Context = { params: Promise<{ id: string }> };

async function resolveVerificationScope(args: {
  articleId: string;
  userId: string;
  requestedTeamId?: string;
}) {
  const article = await prisma.article.findUnique({
    where: { id: args.articleId },
    select: { teamId: true, userId: true },
  });
  if (!article) throw new Error("ARTICLE_NOT_FOUND");
  if (!article.teamId) {
    if (article.userId !== args.userId) throw new Error("ARTICLE_FORBIDDEN");
    return null;
  }
  if (args.requestedTeamId && args.requestedTeamId !== article.teamId) {
    throw new Error("ARTICLE_FORBIDDEN");
  }
  const membership = await prisma.teamMember.findFirst({
    where: { teamId: article.teamId, userId: args.userId },
    select: { teamId: true },
  });
  if (!membership) throw new Error("ARTICLE_FORBIDDEN");
  return article.teamId;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const userId = await requireCurrentUserId();
    const teamId = await resolveVerificationScope({
      articleId: id,
      userId,
      requestedTeamId:
        request.nextUrl.searchParams.get("teamId") ?? undefined,
    });
    return NextResponse.json({
      ok: true,
      ...(await getLatestArticleVerification({
        articleId: id,
        teamId,
      })),
    });
  } catch (error: any) {
    const status =
      error?.message === "ARTICLE_FORBIDDEN"
        ? 403
        : error?.message === "ARTICLE_NOT_FOUND"
          ? 404
          : 500;
    return NextResponse.json(
      apiError("ARTICLE_VERIFICATION_READ_FAILED", error?.message, status).body,
      { status },
    );
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const userId = await requireCurrentUserId();
    const teamId = await resolveVerificationScope({
      articleId: id,
      userId,
      requestedTeamId:
        typeof body.teamId === "string" ? body.teamId : undefined,
    });
    return NextResponse.json({
      ok: true,
      verification: await verifyArticle({
        articleId: id,
        teamId,
      }),
    });
  } catch (error: any) {
    const status =
      error?.message === "ARTICLE_FORBIDDEN"
        ? 403
        : error?.message === "ARTICLE_NOT_FOUND"
          ? 404
          : error?.message?.includes("INVALID")
            ? 422
            : 500;
    return NextResponse.json(
      apiError("ARTICLE_VERIFICATION_FAILED", error?.message, status).body,
      { status },
    );
  }
}
