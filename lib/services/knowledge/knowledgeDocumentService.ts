import { createHash } from "node:crypto";

import { Prisma, type KnowledgeUploadKind } from "@prisma/client";

import { knowledgeLimits } from "@/config/knowledge/limits";
import { validateKnowledgeUpload } from "@/domain/knowledge/documentLifecycle";
import { prisma } from "@/lib/prisma";
import { lockKnowledgeTeam } from "./knowledgeTransaction";

const SCHEDULER_URL = process.env.SCHEDULER_URL?.replace(/\/$/, "");
const SCHEDULER_API_KEY = process.env.MANUAL_API_KEY?.trim();
const BUSY_STATUSES = ["QUEUED", "PARSING", "INDEXING"] as const;

export class KnowledgeServiceError extends Error {
  constructor(
    public code: string,
    public status: number,
    message = code,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function withoutSourceData<T extends { sourceData: unknown }>(document: T) {
  const { sourceData: _sourceData, ...safeDocument } = document;
  void _sourceData;
  return safeDocument;
}

async function requestIndexing(documentId: string) {
  if (!SCHEDULER_URL || !SCHEDULER_API_KEY) {
    throw new Error("SCHEDULER_NOT_CONFIGURED");
  }
  const response = await fetch(`${SCHEDULER_URL}/jobs/knowledge/index`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SCHEDULER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ documentId }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`KNOWLEDGE_INDEX_QUEUE_FAILED:${response.status}`);
  }
  return { queued: true as const };
}

type Tx = Prisma.TransactionClient;

async function quotaSnapshot(tx: Tx, teamId: string, now = new Date()) {
  const windowStart = new Date(
    now.getTime() - knowledgeLimits.uploadRateWindowSeconds * 1000,
  );
  const [activeDocumentCount, bytes, uploadsInWindow, oldestUpload] =
    await Promise.all([
      tx.knowledgeDocument.count({
        where: {
          teamId,
          deletedAt: null,
          replacementDocument: null,
        },
      }),
      tx.knowledgeDocument.aggregate({
        where: { teamId, sourceData: { not: null } },
        _sum: { byteSize: true },
      }),
      tx.knowledgeUploadEvent.count({
        where: { teamId, createdAt: { gte: windowStart } },
      }),
      tx.knowledgeUploadEvent.findFirst({
        where: { teamId, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
  return {
    activeDocumentCount,
    storedBytes: bytes._sum.byteSize ?? 0,
    uploadsInWindow,
    limits: {
      documents: knowledgeLimits.maxDocumentsPerTeam,
      storedBytes: knowledgeLimits.maxStoredBytesPerTeam,
      uploads: knowledgeLimits.uploadRateLimit,
      windowSeconds: knowledgeLimits.uploadRateWindowSeconds,
    },
    retryAfterSeconds: oldestUpload
      ? Math.max(
          1,
          Math.ceil(
            (oldestUpload.createdAt.getTime() +
              knowledgeLimits.uploadRateWindowSeconds * 1000 -
              now.getTime()) /
              1000,
          ),
        )
      : knowledgeLimits.uploadRateWindowSeconds,
  };
}

export async function getKnowledgeQuota(teamId: string) {
  return prisma.$transaction((tx) => quotaSnapshot(tx, teamId));
}

async function archiveOrPurge(
  tx: Tx,
  documentId: string,
  incrementCorpusForTeamId?: string,
) {
  const [retrievedSources, finalCitations, articleCitations] = await Promise.all([
    tx.agentRetrievedSource.count({ where: { documentId } }),
    tx.agentCitation.count({ where: { documentId } }),
    tx.articleFinalCitation.count({ where: { documentId } }),
  ]);
  const citations = retrievedSources + finalCitations + articleCitations;
  if (citations > 0) {
    const archived = await tx.knowledgeDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
      select: { byteSize: true },
    });
    if (incrementCorpusForTeamId) {
      await tx.team.update({
        where: { id: incrementCorpusForTeamId },
        data: { knowledgeCorpusVersion: { increment: 1 } },
      });
    }
    return { disposition: "ARCHIVED" as const, retainedBytes: archived.byteSize };
  }
  await tx.knowledgeDocument.delete({ where: { id: documentId } });
  if (incrementCorpusForTeamId) {
    await tx.team.update({
      where: { id: incrementCorpusForTeamId },
      data: { knowledgeCorpusVersion: { increment: 1 } },
    });
  }
  return { disposition: "PURGED" as const, retainedBytes: 0 };
}

async function reconcileReadyReplacements(teamId: string) {
  const successors = await prisma.knowledgeDocument.findMany({
    where: {
      teamId,
      deletedAt: null,
      status: "READY",
      replacesDocumentId: { not: null },
      replacesDocument: { deletedAt: null },
    },
    select: { replacesDocumentId: true },
  });
  for (const successor of successors) {
    if (!successor.replacesDocumentId) continue;
    try {
      await prisma.$transaction(async (tx) => {
        await lockKnowledgeTeam(tx, teamId);
        const current = await tx.knowledgeDocument.findFirst({
          where: {
            teamId,
            deletedAt: null,
            status: "READY",
            replacesDocumentId: successor.replacesDocumentId,
          },
          select: { replacesDocumentId: true },
        });
        if (current?.replacesDocumentId) {
          await archiveOrPurge(tx, current.replacesDocumentId);
        }
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2003"
      ) {
        throw error;
      }
      await prisma.$transaction(async (tx) => {
        await lockKnowledgeTeam(tx, teamId);
        const current = await tx.knowledgeDocument.findFirst({
          where: {
            teamId,
            deletedAt: null,
            status: "READY",
            replacesDocumentId: successor.replacesDocumentId,
          },
          select: { replacesDocumentId: true },
        });
        if (current?.replacesDocumentId) {
          await tx.knowledgeDocument.updateMany({
            where: {
              id: current.replacesDocumentId,
              teamId,
              deletedAt: null,
            },
            data: { deletedAt: new Date() },
          });
        }
      });
    }
  }
}

async function prepareUpload(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = validateKnowledgeUpload(
    {
      originalName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    },
    bytes,
    knowledgeLimits.maxFileBytes,
  );
  return {
    bytes,
    metadata,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function persistUpload(args: {
  teamId: string;
  userId: string;
  file: File;
  kind: KnowledgeUploadKind;
  replacesDocumentId?: string;
}) {
  const prepared = await prepareUpload(args.file);
  return prisma.$transaction(async (tx) => {
    await lockKnowledgeTeam(tx, args.teamId);

    const predecessor = args.replacesDocumentId
      ? await tx.knowledgeDocument.findFirst({
          where: {
            id: args.replacesDocumentId,
            teamId: args.teamId,
            deletedAt: null,
          },
          include: { replacementDocument: true },
        })
      : null;
    if (args.replacesDocumentId) {
      if (!predecessor) {
        throw new KnowledgeServiceError("KNOWLEDGE_DOCUMENT_NOT_FOUND", 404);
      }
      if (predecessor.status !== "READY") {
        throw new KnowledgeServiceError(
          "KNOWLEDGE_DOCUMENT_NOT_REPLACEABLE",
          409,
        );
      }
      if (predecessor.replacementDocument) {
        throw new KnowledgeServiceError(
          "KNOWLEDGE_REPLACEMENT_IN_PROGRESS",
          409,
        );
      }
      if (predecessor.checksum === prepared.checksum) {
        throw new KnowledgeServiceError(
          "KNOWLEDGE_REPLACEMENT_IDENTICAL",
          409,
        );
      }
    }

    const existing = await tx.knowledgeDocument.findFirst({
      where: {
        teamId: args.teamId,
        checksum: prepared.checksum,
        deletedAt: null,
      },
      orderBy: { sourceVersion: "desc" },
    });
    if (existing) {
      if (args.kind === "REPLACEMENT") {
        throw new KnowledgeServiceError(
          "KNOWLEDGE_REPLACEMENT_IDENTICAL",
          409,
        );
      }
      return {
        document: withoutSourceData(existing),
        deduplicated: true,
        quota: await quotaSnapshot(tx, args.teamId),
      };
    }

    const quota = await quotaSnapshot(tx, args.teamId);
    if (quota.uploadsInWindow >= knowledgeLimits.uploadRateLimit) {
      throw new KnowledgeServiceError(
        "KNOWLEDGE_UPLOAD_RATE_LIMITED",
        429,
        "Upload rate limit exceeded",
        {
          limit: knowledgeLimits.uploadRateLimit,
          windowSeconds: knowledgeLimits.uploadRateWindowSeconds,
          retryAfterSeconds: quota.retryAfterSeconds,
        },
      );
    }
    if (
      args.kind === "UPLOAD" &&
      quota.activeDocumentCount >= knowledgeLimits.maxDocumentsPerTeam
    ) {
      throw new KnowledgeServiceError(
        "KNOWLEDGE_DOCUMENT_LIMIT_EXCEEDED",
        409,
      );
    }
    if (
      quota.storedBytes + prepared.metadata.byteSize >
      knowledgeLimits.maxStoredBytesPerTeam
    ) {
      throw new KnowledgeServiceError(
        "KNOWLEDGE_STORAGE_LIMIT_EXCEEDED",
        413,
      );
    }

    const latestVersion = await tx.knowledgeDocument.findFirst({
      where: { teamId: args.teamId, checksum: prepared.checksum },
      orderBy: { sourceVersion: "desc" },
      select: { sourceVersion: true },
    });
    const document = await tx.knowledgeDocument.create({
      data: {
        teamId: args.teamId,
        uploadedById: args.userId,
        originalName: prepared.metadata.originalName,
        mimeType: prepared.metadata.mimeType,
        byteSize: prepared.metadata.byteSize,
        storageKey: `db://${args.teamId}/${prepared.checksum}/${Date.now()}`,
        checksum: prepared.checksum,
        sourceVersion: (latestVersion?.sourceVersion ?? 0) + 1,
        sourceData: prepared.bytes,
        replacesDocumentId: args.replacesDocumentId,
        uploadEvent: {
          create: {
            teamId: args.teamId,
            userId: args.userId,
            kind: args.kind,
            byteSize: prepared.metadata.byteSize,
          },
        },
      },
    });
    return {
      document: withoutSourceData(document),
      deduplicated: false,
      quota: await quotaSnapshot(tx, args.teamId),
    };
  });
}

async function enqueueSavedDocument(
  saved: Awaited<ReturnType<typeof persistUpload>>,
  oldDocumentPreserved: boolean,
) {
  try {
    return { ...saved, queue: await requestIndexing(saved.document.id) };
  } catch {
    throw new KnowledgeServiceError(
      "KNOWLEDGE_INDEX_QUEUE_FAILED",
      502,
      "Document was saved, but indexing could not be queued",
      { documentId: saved.document.id, oldDocumentPreserved },
    );
  }
}

export async function createKnowledgeDocument(args: {
  teamId: string;
  userId: string;
  file: File;
}) {
  const saved = await persistUpload({ ...args, kind: "UPLOAD" });
  return enqueueSavedDocument(saved, false);
}

export async function replaceKnowledgeDocument(args: {
  teamId: string;
  userId: string;
  documentId: string;
  file: File;
}) {
  const saved = await persistUpload({
    teamId: args.teamId,
    userId: args.userId,
    file: args.file,
    kind: "REPLACEMENT",
    replacesDocumentId: args.documentId,
  });
  const queued = await enqueueSavedDocument(saved, true);
  return { ...queued, replacedDocumentId: args.documentId };
}

export async function listKnowledgeDocuments(teamId: string) {
  await reconcileReadyReplacements(teamId);
  const documents = await prisma.knowledgeDocument.findMany({
    where: { teamId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
      status: true,
      pageCount: true,
      chunkCount: true,
      errorCode: true,
      errorMessage: true,
      indexedAt: true,
      createdAt: true,
      updatedAt: true,
      replacesDocumentId: true,
      activeGenerationId: true,
      classificationOverride: true,
      activeGeneration: {
        select: {
          classificationStatus: true,
          errorMessage: true,
          chunks: { select: { autoRole: true } },
        },
      },
      replacementDocument: {
        select: { id: true, deletedAt: true },
      },
      _count: {
        select: {
          retrievedSources: true,
          citations: true,
          finalCitations: true,
        },
      },
    },
  });
  return {
    documents: documents.map(
      ({ _count, replacementDocument, activeGeneration, ...document }) => {
        const classificationCounts = {
          FACT: 0,
          STYLE_POLICY: 0,
          STYLE_EXAMPLE: 0,
          IGNORE: 0,
          UNCLASSIFIED: 0,
        };
        for (const chunk of activeGeneration?.chunks ?? []) {
          if (chunk.autoRole) classificationCounts[chunk.autoRole] += 1;
          else classificationCounts.UNCLASSIFIED += 1;
        }
        return {
          ...document,
          classificationStatus:
            activeGeneration?.classificationStatus ?? null,
          classificationError: activeGeneration?.errorMessage ?? null,
          classificationCounts,
          citationCount:
            _count.retrievedSources +
            _count.citations +
            _count.finalCitations,
          hasPendingReplacement:
            replacementDocument !== null &&
            replacementDocument.deletedAt === null,
        };
      },
    ),
    quota: await getKnowledgeQuota(teamId),
  };
}

export async function deleteKnowledgeDocument(args: {
  teamId: string;
  documentId: string;
}) {
  let result:
    | {
        documentId: string;
        disposition: "ARCHIVED" | "PURGED";
        retainedBytes: number;
      }
    | undefined;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockKnowledgeTeam(tx, args.teamId);
      const document = await tx.knowledgeDocument.findFirst({
        where: { id: args.documentId, teamId: args.teamId, deletedAt: null },
        include: { replacementDocument: true },
      });
      if (!document) {
        throw new KnowledgeServiceError("KNOWLEDGE_DOCUMENT_NOT_FOUND", 404);
      }
      if (
        BUSY_STATUSES.includes(
          document.status as (typeof BUSY_STATUSES)[number],
        )
      ) {
        throw new KnowledgeServiceError("KNOWLEDGE_DOCUMENT_BUSY", 409);
      }
      if (
        document.replacementDocument &&
        document.replacementDocument.deletedAt === null
      ) {
        throw new KnowledgeServiceError(
          "KNOWLEDGE_REPLACEMENT_IN_PROGRESS",
          409,
        );
      }
      return {
        documentId: document.id,
        ...(await archiveOrPurge(
          tx,
          document.id,
          document.status === "READY" && document.activeGenerationId
            ? args.teamId
            : undefined,
        )),
      };
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2003"
    ) {
      throw error;
    }
    result = await prisma.$transaction(async (tx) => {
      await lockKnowledgeTeam(tx, args.teamId);
      const document = await tx.knowledgeDocument.findFirst({
        where: {
          id: args.documentId,
          teamId: args.teamId,
          deletedAt: null,
        },
        include: { replacementDocument: true },
      });
      if (!document) {
        throw new KnowledgeServiceError("KNOWLEDGE_DOCUMENT_NOT_FOUND", 404);
      }
      if (
        document.replacementDocument &&
        document.replacementDocument.deletedAt === null
      ) {
        throw new KnowledgeServiceError(
          "KNOWLEDGE_REPLACEMENT_IN_PROGRESS",
          409,
        );
      }
      await tx.knowledgeDocument.update({
        where: { id: document.id },
        data: { deletedAt: new Date() },
      });
      return {
        documentId: document.id,
        disposition: "ARCHIVED" as const,
        retainedBytes: document.byteSize,
      };
    });
  }
  return {
    ...result,
    quota: await getKnowledgeQuota(args.teamId),
  };
}

export async function retryKnowledgeDocument(args: {
  teamId: string;
  documentId: string;
}) {
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id: args.documentId, teamId: args.teamId, deletedAt: null },
  });
  if (!document) {
    throw new KnowledgeServiceError("KNOWLEDGE_DOCUMENT_NOT_FOUND", 404);
  }
  if (!["FAILED", "UPLOADED", "READY"].includes(document.status)) {
    throw new KnowledgeServiceError("KNOWLEDGE_DOCUMENT_NOT_RETRYABLE", 409);
  }
  try {
    return await requestIndexing(document.id);
  } catch {
    throw new KnowledgeServiceError(
      "KNOWLEDGE_INDEX_QUEUE_FAILED",
      502,
      "Document remains saved and can be retried",
      {
        documentId: document.id,
        oldDocumentPreserved: Boolean(document.replacesDocumentId),
      },
    );
  }
}
