import { prisma } from "@/lib/prisma";

export async function getResumeDashboardStats(input: {
  userId: string;
  teamId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [thisMonthCompleted] = await Promise.all([
    prisma.application.count({
      where: {
        userId: input.userId,
        teamId: input.teamId,
        status: { in: ["DONE"] },
        updatedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    }),
  ]);

  return { thisMonthCompleted };
}
