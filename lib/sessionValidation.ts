import { prisma } from "@/lib/prisma";

export async function isSessionIdValid(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { expiresAt: true },
  });

  return !!session && session.expiresAt >= new Date();
}
