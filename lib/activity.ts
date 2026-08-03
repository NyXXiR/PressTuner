// lib/activity.ts
import { prisma } from "@/lib/prisma";

export async function recordUserActivity(userId: string, articleId: string) {
  try {
    await prisma.userArticleActivity.upsert({
      where: {
        userId_articleId: {
          userId,
          articleId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        userId,
        articleId,
      },
    });
  } catch (error) {
    // 로그 기록은 메인 로직에 영향을 주면 안 되므로 에러만 출력
    console.error("Failed to record user activity:", error);
  }
}
