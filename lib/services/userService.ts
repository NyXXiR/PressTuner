import { prisma } from "@/lib/prisma";

export async function listUsersByLabel(query: string, take = 20) {
  const q = query.trim();
  if (q.length < 2) return [];

  return prisma.user.findMany({
    where: {
      isActive: true,
      label: { contains: q, mode: "insensitive" },
    },
    select: { id: true, label: true, avatarUrl: true },
    take,
  });
}
