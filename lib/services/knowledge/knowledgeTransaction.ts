import type { Prisma } from "@prisma/client";

export async function lockKnowledgeTeam(
  tx: Prisma.TransactionClient,
  teamId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${teamId}, 0))`;
}
