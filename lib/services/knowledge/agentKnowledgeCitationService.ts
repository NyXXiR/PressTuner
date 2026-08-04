import { decideEvidenceSufficiency } from "@/domain/knowledge/evidencePolicy";
import { resolveAgentKnowledgeRoles } from "@/domain/knowledge/agentKnowledgeRolePolicy";
import type { KnowledgeChunkRole } from "@prisma/client";
import type { KnowledgeQueryPlan } from "@/domain/knowledge/retrievalPipeline";
import {
  resolvePressKnowledgeRetrievalConfiguration,
  type PressKnowledgeRetrievalConfiguration,
} from "@/domain/knowledge/retrievalRuntime";
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
  roles?: readonly KnowledgeChunkRole[];
  configurationId?: PressKnowledgeRetrievalConfiguration["id"];
};

const AGENT_KNOWLEDGE_TRANSACTION_TIMEOUT_MS = 30_000;

export async function persistPreparedAgentKnowledgeCitations(
  args: AgentKnowledgeSearchArgs & {
    query: string;
    embedding: readonly number[];
    queryPlan?: KnowledgeQueryPlan;
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
      roles: resolveAgentKnowledgeRoles({
        query: args.query,
        requestedRoles: args.roles,
      }),
      queryPlan: args.queryPlan,
      configuration: resolvePressKnowledgeRetrievalConfiguration(
        args.configurationId,
      ),
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
    const evidenceDecision = decideEvidenceSufficiency({
      query: result.queryPlan.originalQuery,
      candidates: citations.map((citation, index) => {
        const trace = result.trace.find(
          (candidate) => candidate.chunkId === citation.chunkId,
        );
        return {
          sourceId: citation.sourceId,
          documentId: citation.documentId,
          sourceVersion: trace?.sourceVersion ?? 1,
          content: result.hits[index]?.content ?? "",
          fusedScore: trace?.fusedScore ?? citation.score,
        };
      }),
    });
    return {
      context: result.hits
        .map((hit, index) => {
          const citation = citations[index];
          return `[${citation.sourceId}] ${citation.documentName} (p.${citation.pageStart}-${citation.pageEnd})\n${hit.content}`;
        })
        .join("\n\n"),
      citations,
      evidenceDecision,
      queryPlan: result.queryPlan,
      candidateTrace: result.trace.map((candidate) => ({
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        sourceVersion: candidate.sourceVersion,
        vectorRank: candidate.vectorRank,
        vectorScore: candidate.vectorScore,
        lexicalRank: candidate.lexicalRank,
        lexicalScore: candidate.lexicalScore,
        fusedRank: candidate.fusedRank,
        fusedScore: candidate.fusedScore,
        rerankScore: candidate.rerankScore,
        selected: candidate.selected,
        exclusionReason: candidate.exclusionReason,
      })),
    };
  }, { timeout: AGENT_KNOWLEDGE_TRANSACTION_TIMEOUT_MS });
}

export async function searchKnowledgeAndPersistAgentCitations(
  args: AgentKnowledgeSearchArgs & { query: string },
) {
  const prepared = await prepareKnowledgeQuery(args.query, {
    configuration: resolvePressKnowledgeRetrievalConfiguration(
      args.configurationId,
    ),
  });
  return persistPreparedAgentKnowledgeCitations({
    ...args,
    ...prepared,
  });
}
