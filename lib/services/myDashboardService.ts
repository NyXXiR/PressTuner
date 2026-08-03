import { prisma } from "@/lib/prisma";
import { ArticleStatus, ReviewAssignmentStatus, type Prisma } from "@prisma/client";
import { kstMonthUtcRange } from "@/lib/utils/datetime";

export async function getMyDashboardSummary(userId: string) {
  const globalMyArticlesWhere: Prisma.ArticleWhereInput = {
    userId,
  };

  const globalReviewWhere: Prisma.ArticleReviewAssignmentWhereInput = {
    reviewerId: userId,
    status: ReviewAssignmentStatus.PENDING,
    article: {
      status: ArticleStatus.IN_PROGRESS,
    },
  };

  const { startUtc, endUtc } = kstMonthUtcRange();

  const [
    pendingDraftCount,
    monthCreated,
    monthFinalized,
    recentActivities,
    myReviewQueue,
  ] = await Promise.all([
    prisma.articleReviewAssignment.count({
      where: globalReviewWhere,
    }),
    prisma.article.count({
      where: {
        ...globalMyArticlesWhere,
        createdAt: { gte: startUtc, lt: endUtc },
        status: { not: ArticleStatus.BRIEF },
      },
    }),
    prisma.article.count({
      where: {
        ...globalMyArticlesWhere,
        status: ArticleStatus.FINAL,
        updatedAt: { gte: startUtc, lt: endUtc },
      },
    }),
    prisma.userArticleActivity.findMany({
      where: {
        userId,
        article: {
          status: { not: ArticleStatus.BRIEF },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        article: {
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            team: { select: { name: true } },
          },
        },
      },
    }),
    prisma.articleReviewAssignment.findMany({
      where: globalReviewWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        article: {
          select: {
            id: true,
            title: true,
            status: true,
            user: { select: { label: true } },
            team: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return {
    summary: {
      pendingDrafts: pendingDraftCount,
      monthCreated,
      monthFinalized,
    },
    recent: recentActivities
      .filter((act) => act.article)
      .map((act) => ({
        id: act.article!.id,
        title: act.article!.title || "제목 없음",
        status: act.article!.status,
        updatedAt: act.updatedAt.toISOString(),
        teamName: act.article!.team?.name,
      })),
    reviews: myReviewQueue.map((r) => ({
      id: r.id,
      articleId: r.article.id,
      title: r.article.title,
      requester: r.article.user?.label,
      teamName: r.article.team?.name,
      assignedAt: r.createdAt.toISOString(),
    })),
  };
}
