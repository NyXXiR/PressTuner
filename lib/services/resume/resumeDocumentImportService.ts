import {
  CareerSourceStatus,
  ResumeDocumentImportStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { createCareerSource } from "./careerSourceService";
import { enqueueResumeDocumentImport } from "./careerSchedulerClient";

const importInclude = {
  source: {
    select: {
      id: true,
      originalName: true,
      status: true,
      pageCount: true,
      errorCode: true,
      errorMessage: true,
    },
  },
  _count: { select: { candidates: true } },
} as const;

async function queueImport(input: {
  id: string;
  sourceId: string;
  userId: string;
  processingVersion: number;
}) {
  const queuedAt = new Date();
  const claimed = await prisma.resumeDocumentImport.updateMany({
    where: {
      id: input.id,
      userId: input.userId,
      processingVersion: input.processingVersion,
      status: {
        in: [ResumeDocumentImportStatus.WAITING_SOURCE, ResumeDocumentImportStatus.FAILED],
      },
      source: { status: CareerSourceStatus.READY, deletedAt: null },
    },
    data: {
      status: ResumeDocumentImportStatus.QUEUED,
      queuedAt,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) return;
  try {
    await enqueueResumeDocumentImport({
      importId: input.id,
      sourceId: input.sourceId,
      userId: input.userId,
      processingVersion: input.processingVersion,
    });
  } catch (error) {
    await prisma.resumeDocumentImport.updateMany({
      where: {
        id: input.id,
        userId: input.userId,
        processingVersion: input.processingVersion,
        status: ResumeDocumentImportStatus.QUEUED,
        queuedAt,
      },
      data: {
        status: ResumeDocumentImportStatus.FAILED,
        failedAt: new Date(),
        errorCode: "RESUME_DOCUMENT_IMPORT_QUEUE_UNAVAILABLE",
        errorMessage: error instanceof Error ? error.message.slice(0, 2_000) : "Queue unavailable",
      },
    });
  }
}

export async function createResumeDocumentImport(input: {
  userId: string;
  teamId: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const sourceResult = await createCareerSource(input);
  const created = await prisma.resumeDocumentImport.create({
    data: {
      userId: input.userId,
      sourceId: sourceResult.source.id,
      status: ResumeDocumentImportStatus.WAITING_SOURCE,
    },
    include: importInclude,
  });
  if (sourceResult.source.status === CareerSourceStatus.READY) {
    await queueImport({
      id: created.id,
      sourceId: created.sourceId,
      userId: created.userId,
      processingVersion: created.processingVersion,
    });
  }
  return getResumeDocumentImport({ importId: created.id, userId: input.userId });
}

export async function listResumeDocumentImports(userId: string) {
  return prisma.resumeDocumentImport.findMany({
    where: { userId },
    include: importInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getResumeDocumentImport(input: { importId: string; userId: string }) {
  const item = await prisma.resumeDocumentImport.findFirst({
    where: { id: input.importId, userId: input.userId },
    include: importInclude,
  });
  if (!item) throw serviceError(404, "RESUME_DOCUMENT_IMPORT_NOT_FOUND", "Resume document import not found");
  return item;
}

export async function retryResumeDocumentImport(input: { importId: string; userId: string }) {
  const current = await prisma.resumeDocumentImport.findFirst({
    where: { id: input.importId, userId: input.userId },
    include: { source: { select: { status: true, deletedAt: true } } },
  });
  if (!current) throw serviceError(404, "RESUME_DOCUMENT_IMPORT_NOT_FOUND", "Resume document import not found");
  if (current.status !== ResumeDocumentImportStatus.FAILED) {
    throw serviceError(409, "RESUME_DOCUMENT_IMPORT_NOT_RETRYABLE", "Import is not retryable");
  }
  if (current.source.deletedAt || current.source.status !== CareerSourceStatus.READY) {
    throw serviceError(409, "RESUME_DOCUMENT_SOURCE_NOT_READY", "PDF source must be ready before retry");
  }
  const reset = await prisma.resumeDocumentImport.update({
    where: { id: current.id },
    data: {
      status: ResumeDocumentImportStatus.WAITING_SOURCE,
      processingVersion: { increment: 1 },
      errorCode: null,
      errorMessage: null,
      failedAt: null,
    },
    select: { id: true, sourceId: true, userId: true, processingVersion: true },
  });
  await queueImport(reset);
  return getResumeDocumentImport(input);
}
