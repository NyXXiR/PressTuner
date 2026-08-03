import type { KnowledgeDocumentStatus } from "./documentLifecycle";
import { assertKnowledgeScope } from "./documentLifecycle";
import type { KnowledgeChunkRole } from "./classification";
import { isKnowledgeRoleSearchable } from "./classification";

export type KnowledgeIndexingDecision =
  | "SKIP"
  | "ENQUEUE"
  | "RETRY"
  | "REPLACE";

export function decideKnowledgeIndexing(args: {
  status: KnowledgeDocumentStatus;
  currentFingerprint: string | null;
  requestedFingerprint: string;
}): KnowledgeIndexingDecision {
  if (args.requestedFingerprint.trim().length === 0) {
    throw new Error("KNOWLEDGE_INDEXING_FINGERPRINT_REQUIRED");
  }

  if (
    args.status === "READY" &&
    args.currentFingerprint === args.requestedFingerprint
  ) {
    return "SKIP";
  }
  if (args.status === "READY") return "REPLACE";
  if (args.status === "FAILED") return "RETRY";
  return "ENQUEUE";
}

export type KnowledgeRetrievalHit = {
  teamId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  score: number;
  automaticRole: KnowledgeChunkRole | null;
  documentOverride: KnowledgeChunkRole | null;
};

export type KnowledgeCitation = Omit<
  KnowledgeRetrievalHit,
  "teamId" | "content" | "automaticRole" | "documentOverride"
> & {
  sourceId: string;
};

export function buildGroundedRetrieval(args: {
  activeTeamId: string;
  hits: readonly KnowledgeRetrievalHit[];
  requestedRoles: readonly KnowledgeChunkRole[];
}): {
  context: string;
  citations: KnowledgeCitation[];
} {
  const eligibleHits = args.hits.filter((hit) =>
    isKnowledgeRoleSearchable({
      automaticRole: hit.automaticRole,
      documentOverride: hit.documentOverride,
      requestedRoles: args.requestedRoles,
    }),
  );
  const citations = eligibleHits.map((hit, index) => {
    assertKnowledgeScope({
      activeTeamId: args.activeTeamId,
      resourceTeamId: hit.teamId,
    });

    return {
      sourceId: `source-${index + 1}`,
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      documentName: hit.documentName,
      pageStart: hit.pageStart,
      pageEnd: hit.pageEnd,
      score: hit.score,
    };
  });

  const context = eligibleHits
    .map((hit, index) => {
      const sourceId = citations[index]?.sourceId;
      const pages =
        hit.pageStart === hit.pageEnd
          ? `p.${hit.pageStart}`
          : `pp.${hit.pageStart}-${hit.pageEnd}`;
      return `[${sourceId}] ${hit.documentName} (${pages})\n${hit.content}`;
    })
    .join("\n\n");

  return { context, citations };
}
