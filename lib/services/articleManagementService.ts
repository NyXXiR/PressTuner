import { prisma } from "@/lib/prisma";
import { ArticleStatus, ArticleType, type Prisma } from "@prisma/client";
import { kstMonthUtcRange } from "@/lib/utils/datetime";
import { serviceError } from "@/lib/services/serviceError";
import { getUsageSummaryUseCase } from "@/lib/services/article/usageUseCases";
import { recordUserActivity } from "@/lib/activity";

export async function getArticleForUser(input: {
  articleId: string;
  userId: string;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    include: { pressExtra: true },
  });

  if (!article) {
    throw serviceError(404, "NOT_FOUND", "NOT_FOUND");
  }

  if (article.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: article.teamId, userId: input.userId } },
    });
    if (!membership) {
      throw serviceError(403, "FORBIDDEN", "팀 멤버가 아닙니다.");
    }
  } else if (article.userId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "권한이 없습니다.");
  }

  await recordUserActivity(input.userId, input.articleId);

  let usage = null;
  if (article.teamId) {
    usage = await getUsageSummaryUseCase(article.teamId);
  }

  return { article, usage };
}

export async function listMyArticles(input: {
  userId: string;
  page: number;
  pageSize: number;
  q?: string;
  status?: (keyof typeof ArticleStatus)[];
  type?: (keyof typeof ArticleType)[];
  period?: string | null;
}) {
  const where: Prisma.ArticleWhereInput = {
    userId: input.userId,
    status: { not: ArticleStatus.BRIEF },
  };

  if (input.q) {
    where.title = { contains: input.q, mode: "insensitive" };
  }
  if (input.status && input.status.length > 0) {
    where.status = { in: input.status.map((s) => ArticleStatus[s]) };
  }
  if (input.type && input.type.length > 0) {
    where.type = { in: input.type.map((t) => ArticleType[t]) };
  }
  if (input.period === "current_month") {
    const { startUtc, endUtc } = kstMonthUtcRange();
    where.createdAt = { gte: startUtc, lt: endUtc };
  }

  const [total, items] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        teamId: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return { total, items };
}

export async function deleteMyArticle(input: {
  articleId: string;
  userId: string;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, userId: true, teamId: true },
  });
  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  let allowed = false;
  if (article.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: article.teamId, userId: input.userId },
      select: { role: true },
    });
    allowed = !!membership;
  } else {
    allowed = article.userId === input.userId;
  }

  if (!allowed) {
    throw serviceError(403, "FORBIDDEN", "삭제 권한이 없습니다.");
  }

  await prisma.article.delete({ where: { id: input.articleId } });
}

export async function bulkDeleteMyArticles(input: {
  userId: string;
  ids: string[];
}) {
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw serviceError(400, "NO_ITEMS", "삭제할 항목이 없습니다.");
  }

  const ownIds = await prisma.article.findMany({
    where: { id: { in: input.ids }, userId: input.userId },
    select: { id: true },
  });
  const allowedIds = ownIds.map((x) => x.id);

  if (allowedIds.length === 0) {
    throw serviceError(403, "FORBIDDEN", "삭제 권한이 없습니다.");
  }

  const res = await prisma.article.deleteMany({
    where: { id: { in: allowedIds } },
  });

  return { deletedCount: res.count, requested: input.ids.length };
}

export async function updateMyArticleTeam(input: {
  articleId: string;
  userId: string;
  teamId: string | null;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, userId: true, teamId: true },
  });

  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  if (article.userId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "팀 변경 권한이 없습니다.");
  }

  if (input.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: input.teamId, userId: input.userId },
      select: { role: true },
    });
    if (!membership) {
      throw serviceError(403, "FORBIDDEN", "해당 팀의 멤버가 아닙니다.");
    }
  }

  await prisma.article.update({
    where: { id: input.articleId },
    data: { teamId: input.teamId },
    select: { id: true },
  });
}

export async function listTeamArticlesForUser(input: {
  userId: string;
  page: number;
  pageSize: number;
  q: string;
  statusParams: string[];
  period?: string | null;
}) {
  const membership = await prisma.teamMember.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    throw serviceError(403, "NO_TEAM", "소속된 팀이 없습니다.");
  }

  const teamId = membership.teamId;
  const where: Prisma.ArticleWhereInput = {
    teamId,
    status: { not: ArticleStatus.BRIEF },
    OR: input.q
      ? [
          { title: { contains: input.q, mode: "insensitive" } },
          { user: { label: { contains: input.q, mode: "insensitive" } } },
        ]
      : undefined,
  };

  if (input.statusParams.length > 0) {
    where.status = { in: input.statusParams as ArticleStatus[] };
  }

  if (input.period === "current_month") {
    const { startUtc, endUtc } = kstMonthUtcRange();
    where.createdAt = { gte: startUtc, lt: endUtc };
  }

  const [total, items] = await prisma.$transaction([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { label: true } },
      },
    }),
  ]);

  return {
    teamId,
    total,
    items,
  };
}

export async function listTeamArticlesByTeamId(input: {
  teamId: string;
  userId: string;
  page: number;
  pageSize: number;
  q: string;
  statusParams: string[];
  period?: string | null;
}) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
  });
  if (!membership) {
    throw serviceError(403, "FORBIDDEN", "Forbidden");
  }

  const where: Prisma.ArticleWhereInput = {
    teamId: input.teamId,
    OR: input.q
      ? [
          { title: { contains: input.q, mode: "insensitive" } },
          { user: { label: { contains: input.q, mode: "insensitive" } } },
        ]
      : undefined,
  };

  if (input.statusParams.length > 0) {
    where.status = { in: input.statusParams as ArticleStatus[] };
  }
  if (input.period === "current_month") {
    const { startUtc, endUtc } = kstMonthUtcRange();
    where.createdAt = { gte: startUtc, lt: endUtc };
  }

  const [total, items] = await prisma.$transaction([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { label: true, avatarUrl: true } },
      },
    }),
  ]);

  return { total, items };
}

export async function deleteTeamArticle(input: {
  teamId: string;
  userId: string;
  role: string;
  articleId: string;
}) {
  const article = await prisma.article.findFirst({
    where: { id: input.articleId, teamId: input.teamId, type: "PRESS_RELEASE" },
    select: { id: true, userId: true },
  });

  if (!article) {
    throw serviceError(404, "NOT_FOUND", "NOT_FOUND");
  }

  const canDelete =
    input.role === "OWNER" ||
    input.role === "ADMIN" ||
    (article.userId && article.userId === input.userId);

  if (!canDelete) {
    throw serviceError(403, "FORBIDDEN", "FORBIDDEN");
  }

  await prisma.article.delete({ where: { id: article.id } });
}

export async function bulkDeleteTeamArticles(input: {
  teamId: string;
  ids: string[];
}) {
  if (!input.ids || input.ids.length === 0) return;

  await prisma.article.deleteMany({
    where: { teamId: input.teamId, type: "PRESS_RELEASE", id: { in: input.ids } },
  });
}

export async function getTeamDashboardStats(input: {
  teamId: string;
  userId: string;
}) {
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId: input.teamId, userId: input.userId },
    },
  });

  if (!membership) {
    throw serviceError(403, "FORBIDDEN", "접근 권한이 없습니다.");
  }

  const { startUtc, endUtc } = kstMonthUtcRange();

  const [pendingCount, monthCreated, monthFinalized, recentArticles] =
    await Promise.all([
      prisma.article.count({
        where: {
          teamId: input.teamId,
          status: ArticleStatus.IN_PROGRESS,
        },
      }),
      prisma.article.count({
        where: {
          teamId: input.teamId,
          createdAt: { gte: startUtc, lt: endUtc },
          status: { not: ArticleStatus.BRIEF },
        },
      }),
      prisma.article.count({
        where: {
          teamId: input.teamId,
          status: ArticleStatus.FINAL,
          updatedAt: { gte: startUtc, lt: endUtc },
        },
      }),
      prisma.article.findMany({
        where: {
          teamId: input.teamId,
          status: { not: ArticleStatus.BRIEF },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          user: { select: { label: true } },
        },
      }),
    ]);

  return {
    stats: {
      pendingCount,
      monthCreated,
      monthFinalized,
    },
    recent: recentArticles.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      author: a.user?.label || "알 수 없음",
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}
