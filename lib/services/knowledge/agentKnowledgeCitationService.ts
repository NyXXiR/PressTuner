import { prisma } from "@/lib/prisma";
import {
  prepareKnowledgeQuery,
  searchKnowledgeWithPreparedQuery,
} from "./knowledgeRetrievalService";
import { lockKnowledgeTeam } from "./knowledgeTransaction";

type AgentKnowledgeSearchArgs = {
  teamId: string;
  runId: string;
  topK?: number;
  documentIds?: readonly string[];
};

export async function persistPreparedAgentKnowledgeCitations(
  args: AgentKnowledgeSearchArgs & {
    query: string;
    embedding: readonly number[];
  },
  testHooks?: { afterRetrieval?: () => Promise<void> },
) {
  return prisma.$transaction(async (tx) => {
    await lockKnowledgeTeam(tx, args.teamId);
    const run = await tx.agentRun.findFirst({
      where: { id: args.runId, teamId: args.teamId },
      select: { id: true },
    });
    if (!run) throw new Error("PRESS_AGENT_RUN_NOT_FOUND");

    const result = await searchKnowledgeWithPreparedQuery(tx, {
      teamId: args.teamId,
      query: args.query,
      embedding: args.embedding,
      topK: args.topK,
      documentIds: args.documentIds,
    });
    await testHooks?.afterRetrieval?.();
    const existingCount = await tx.agentRetrievedSource.count({
      where: { runId: args.runId },
    });
    const citations = result.hits.map((hit, index) => ({
      sourceId: `source-${existingCount + index + 1}`,
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentName: hit.documentName,
      pageStart: hit.pageStart,
      pageEnd: hit.pageEnd,
      score: hit.score,
    }));
    if (citations.length > 0) {
      await tx.agentRetrievedSource.createMany({
        data: citations.map((citation, index) => ({
          runId: args.runId,
          documentId: citation.documentId,
          chunkId: citation.chunkId,
          sourceId: citation.sourceId,
          documentName: citation.documentName,
          pageStart: citation.pageStart,
          pageEnd: citation.pageEnd,
          excerpt: result.hits[index]?.content.slice(0, 1_000) ?? "",
          score: citation.score,
        })),
      });
    }
    return {
      context: result.hits
        .map((hit, index) => {
          const citation = citations[index];
          return `[${citation.sourceId}] ${citation.documentName} (p.${citation.pageStart}-${citation.pageEnd})\n${hit.content}`;
        })
        .join("\n\n"),
      citations,
    };
  });
}

export async function searchKnowledgeAndPersistAgentCitations(
  args: AgentKnowledgeSearchArgs & { query: string },
) {
  const prepared = await prepareKnowledgeQuery(args.query);
  return persistPreparedAgentKnowledgeCitations({
    ...args,
    ...prepared,
  });
}
