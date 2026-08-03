import { prisma } from "@/lib/prisma";

export async function deleteSessionById(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } });
}
