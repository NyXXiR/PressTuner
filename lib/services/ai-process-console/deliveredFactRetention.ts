import { AI_PROCESS_CONSOLE_SOURCE } from "@/domain/ai-process-console/v1/publication";
import { prisma } from "@/lib/prisma";

type RetentionDatabase = Readonly<{
  aiProcessFactOutbox: Readonly<{
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  }>;
}>;

export async function retainDeliveredAiProcessFacts(args: {
  retentionDays: number;
  batchSize: number;
  now?: Date;
  database?: RetentionDatabase;
}): Promise<Readonly<{ selectedCount: number; deletedCount: number }>> {
  if (!Number.isInteger(args.retentionDays) || args.retentionDays < 7) throw new Error("AI_PROCESS_RETENTION_DAYS_INVALID");
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 1000) throw new Error("AI_PROCESS_RETENTION_BATCH_INVALID");
  const database = args.database ?? (prisma as unknown as RetentionDatabase);
  const cutoff = new Date((args.now ?? new Date()).getTime() - args.retentionDays * 24 * 60 * 60 * 1000);
  const eligible = await database.aiProcessFactOutbox.findMany({
    where: { source: AI_PROCESS_CONSOLE_SOURCE, deliveryState: "DELIVERED", deliveredAt: { not: null, lt: cutoff } },
    orderBy: [{ deliveredAt: "asc" }, { id: "asc" }],
    take: args.batchSize,
    select: { id: true },
  });
  if (eligible.length === 0) return { selectedCount: 0, deletedCount: 0 };
  const deleted = await database.aiProcessFactOutbox.deleteMany({
    where: { id: { in: eligible.map(({ id }) => id) }, source: AI_PROCESS_CONSOLE_SOURCE, deliveryState: "DELIVERED", deliveredAt: { not: null, lt: cutoff } },
  });
  return { selectedCount: eligible.length, deletedCount: deleted.count };
}
