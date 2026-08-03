import { prisma } from "@/lib/prisma";

function devLog(...args: any[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[acl:getReadableArticleOrNull]", ...args);
  }
}

export async function getReadableArticleOrNull(
  articleId: string | undefined,
  userId: string,
  currentTeamId?: string | null
) {
  if (!articleId) {
    devLog("DENY: missing articleId", { userId, currentTeamId });
    return null;
  }

  devLog("START", { articleId, userId, currentTeamId });

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      teamId: true,
      userId: true,
      title: true,
      status: true,
      type: true,
      bodyJson: true,
      rawInput: true,
      isShared: true,
      shareToken: true,
      createdAt: true,
      updatedAt: true,
      pressExtra: { select: { lead: true, fact: true } },
    },
  });

  if (!article) {
    devLog("DENY: article not found", { articleId });
    return null;
  }

  devLog("FOUND", {
    articleId: article.id,
    articleTeamId: article.teamId,
    articleUserId: article.userId,
    type: article.type,
    status: article.status,
  });

  // ✅ 팀 문서인 경우: 현재 보고 있는 화면의 맥락(currentTeamId)과 상관없이
  // 사용자가 "해당 기사의 팀" 멤버인지만 확인하여 접근을 허용합니다.
  if (article.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: article.teamId,
          userId,
        },
      },
      select: { teamId: true },
    });

    if (!membership) {
      devLog("DENY: no membership in article's team", {
        articleId,
        articleTeamId: article.teamId,
        userId,
      });
      return null;
    }

    // currentTeamId가 제공되었는데 기사의 팀과 다르다면 로그만 남기고 허용 (Cross-team view)
    if (currentTeamId && article.teamId !== currentTeamId) {
      devLog("WARN: accessing article from different team context", {
        currentTeamId,
        articleTeamId: article.teamId,
      });
    }

    devLog("ALLOW: team membership verified", {
      articleId,
      userId,
      teamId: article.teamId,
    });
    return article;
  }

  // ✅ 개인 문서인 경우: 본인 확인
  if (article.userId !== userId) {
    devLog("DENY: personal article owner mismatch", {
      articleId,
      articleUserId: article.userId,
      userId,
    });
    return null;
  }

  devLog("ALLOW: personal article owner ok", { articleId, userId });
  return article;
}
