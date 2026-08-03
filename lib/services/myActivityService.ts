import { prisma } from "@/lib/prisma";

export async function clearUserArticleActivity(userId: string) {
  await prisma.userArticleActivity.deleteMany({ where: { userId } });
}
