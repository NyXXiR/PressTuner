import { assertFinalSourceIds } from "@/domain/press-agent/runPolicy";
import { prisma } from "@/lib/prisma";

export async function persistFinalAgentCitations(args: {
  teamId: string;
  runId: string;
  sourceIds: readonly string[];
  articleId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-evidence:${args.runId}`}, 0))`;
    const run = await tx.agentRun.findFirst({
      where: { id: args.runId, teamId: args.teamId },
      select: { id: true, articleId: true },
    });
    if (!run) throw new Error("PRESS_AGENT_RUN_NOT_FOUND");
    const retrieved = await tx.agentRetrievedSource.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: "asc" },
    });
    const selectedIds = assertFinalSourceIds(
      args.sourceIds,
      retrieved.map(({ sourceId }) => sourceId),
    );
    const selected = retrieved.filter(({ sourceId }) =>
      selectedIds.includes(sourceId),
    );
    const articleId = args.articleId ?? run.articleId;
    if (articleId && selected.length > 0) {
      const accepted = await tx.articleFact.findMany({
        where: {
          articleId,
          teamId: args.teamId,
          active: true,
          chunkId: { in: selected.map(({ chunkId }) => chunkId) },
        },
        select: { chunkId: true },
      });
      const acceptedChunks = new Set(accepted.map(({ chunkId }) => chunkId));
      if (selected.some(({ chunkId }) => !acceptedChunks.has(chunkId))) {
        throw new Error("PRESS_AGENT_ARTICLE_SOURCE_NOT_ACCEPTED");
      }
    }
    await tx.agentCitation.deleteMany({ where: { runId: run.id } });
    if (selected.length > 0) {
      await tx.agentCitation.createMany({
        data: selected.map((source) => ({
          runId: run.id,
          stepId: source.stepId,
          documentId: source.documentId,
          chunkId: source.chunkId,
          sourceId: source.sourceId,
          documentName: source.documentName,
          pageStart: source.pageStart,
          pageEnd: source.pageEnd,
          excerpt: source.excerpt,
        })),
      });
    }
    return selected;
  });
}
