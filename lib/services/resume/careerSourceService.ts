import { createHash } from "node:crypto";

import { CareerExperienceStatus, CareerSourceStatus, Prisma } from "@prisma/client";

import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { canRetryCareerSource } from "@/domain/career-memory/sourceLifecycle";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { enqueueCareerSource } from "./careerSchedulerClient";

export const CAREER_SOURCE_MAX_BYTES = 20 * 1024 * 1024;

export function validateCareerPdf(input: {
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  if (!input.originalName.toLocaleLowerCase("en-US").endsWith(".pdf")) {
    throw serviceError(400, "CAREER_SOURCE_EXTENSION_INVALID", "Only PDF files are accepted");
  }
  if (input.mimeType !== "application/pdf") {
    throw serviceError(400, "CAREER_SOURCE_MIME_INVALID", "Only application/pdf is accepted");
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > CAREER_SOURCE_MAX_BYTES) {
    throw serviceError(
      400,
      "CAREER_SOURCE_SIZE_INVALID",
      "PDF must be between 1 byte and 20 MB",
    );
  }
  if (Buffer.from(input.bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw serviceError(400, "CAREER_SOURCE_SIGNATURE_INVALID", "Invalid PDF signature");
  }
}

function sourceChecksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

const sourcePublicSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  checksum: true,
  byteSize: true,
  status: true,
  processingVersion: true,
  pageCount: true,
  chunkCount: true,
  candidateCount: true,
  parserVersion: true,
  embeddingModel: true,
  errorCode: true,
  errorMessage: true,
  queuedAt: true,
  processingStartedAt: true,
  readyAt: true,
  failedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CareerSourceSelect;

export async function listCareerSources(userId: string) {
  return prisma.careerSource.findMany({
    where: { userId, deletedAt: null },
    select: sourcePublicSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCareerSource(input: {
  sourceId: string;
  userId: string;
}) {
  const source = await prisma.careerSource.findFirst({
    where: { id: input.sourceId, userId: input.userId, deletedAt: null },
    select: {
      ...sourcePublicSelect,
      candidates: {
        where: { userId: input.userId },
        select: { id: true, status: true, title: true, mode: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!source) {
    throw serviceError(404, "CAREER_SOURCE_NOT_FOUND", "Career source not found");
  }
  return source;
}

async function requestSourceProcessing(source: {
  id: string;
  userId: string;
  teamId: string | null;
  processingVersion: number;
}, options: { reportQueueFailure?: boolean } = {}) {
  const queuedAt = new Date();
  const claimed = await prisma.careerSource.updateMany({
    where: {
      id: source.id,
      userId: source.userId,
      processingVersion: source.processingVersion,
      status: CareerSourceStatus.UPLOADED,
      deletedAt: null,
    },
    data: {
      status: CareerSourceStatus.QUEUED,
      queuedAt,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) {
    const current = await prisma.careerSource.findFirst({
      where: { id: source.id, userId: source.userId, deletedAt: null },
      select: sourcePublicSelect,
    });
    if (!current) {
      throw serviceError(404, "CAREER_SOURCE_NOT_FOUND", "Career source not found");
    }
    return current;
  }
  try {
    await enqueueCareerSource({
      sourceId: source.id,
      userId: source.userId,
      teamId: source.teamId,
      processingVersion: source.processingVersion,
    });
    return await prisma.careerSource.findUniqueOrThrow({
      where: { id: source.id },
      select: sourcePublicSelect,
    });
  } catch (error) {
    await prisma.careerSource.updateMany({
      where: {
        id: source.id,
        userId: source.userId,
        processingVersion: source.processingVersion,
        status: CareerSourceStatus.QUEUED,
        queuedAt,
      },
      data: {
        status: CareerSourceStatus.FAILED,
        failedAt: new Date(),
        errorCode: "CAREER_QUEUE_UNAVAILABLE",
        errorMessage: error instanceof Error ? error.message : "Queue unavailable",
      },
    });
    if (options.reportQueueFailure) {
      throw serviceError(503, "CAREER_QUEUE_UNAVAILABLE", "Career source could not be queued");
    }
    return prisma.careerSource.findUniqueOrThrow({
      where: { id: source.id },
      select: sourcePublicSelect,
    });
  }
}

export async function createCareerSource(input: {
  userId: string;
  teamId: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  validateCareerPdf(input);
  const checksum = sourceChecksum(input.bytes);
  const accepted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}), hashtext(${checksum}))`,
    );
    const existing = await tx.careerSource.findFirst({
      where: { userId: input.userId, checksum, deletedAt: null },
      select: sourcePublicSelect,
    });
    if (existing) return { source: existing, deduplicated: true as const };

    await consumeAiQuota({
      teamId: input.teamId,
      userId: input.userId,
      action: "resume_parse",
      meta: {
        route: "/api/resume/career/sources",
        checksum,
        byteSize: input.bytes.byteLength,
      },
      client: tx,
    });
    const source = await tx.careerSource.create({
      data: {
        userId: input.userId,
        teamId: input.teamId,
        originalName: input.originalName,
        mimeType: input.mimeType,
        checksum,
        byteSize: input.bytes.byteLength,
        sourceData: Buffer.from(input.bytes),
        status: CareerSourceStatus.UPLOADED,
      },
      select: {
        ...sourcePublicSelect,
        userId: true,
        teamId: true,
      },
    });
    return { source, deduplicated: false as const };
  });

  if (accepted.deduplicated) return accepted;
  const source = await requestSourceProcessing(accepted.source);
  return { source, deduplicated: false as const };
}

export async function retryCareerSource(input: {
  sourceId: string;
  userId: string;
}) {
  const source = await prisma.$transaction(async (tx) => {
    const current = await tx.careerSource.findFirst({
      where: { id: input.sourceId, userId: input.userId, deletedAt: null },
    });
    if (!current) {
      throw serviceError(404, "CAREER_SOURCE_NOT_FOUND", "Career source not found");
    }
    if (!current.sourceData) {
      throw serviceError(409, "CAREER_SOURCE_BYTES_PURGED", "Deleted source cannot be retried");
    }
    if (!canRetryCareerSource(current.status)) {
      throw serviceError(409, "CAREER_SOURCE_NOT_RETRYABLE", "Source is not retryable");
    }
    return tx.careerSource.update({
      where: { id: current.id },
      data: {
        status: CareerSourceStatus.UPLOADED,
        processingVersion: { increment: 1 },
        errorCode: null,
        errorMessage: null,
        failedAt: null,
      },
      select: {
        id: true,
        userId: true,
        teamId: true,
        processingVersion: true,
      },
    });
  });
  return requestSourceProcessing(source, { reportQueueFailure: true });
}

export async function deleteCareerSource(input: {
  sourceId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.careerSource.findFirst({
      where: { id: input.sourceId, userId: input.userId, deletedAt: null },
      select: { id: true },
    });
    if (!source) {
      throw serviceError(404, "CAREER_SOURCE_NOT_FOUND", "Career source not found");
    }

    const affectedFacts = await tx.careerFact.findMany({
      where: {
        userId: input.userId,
        evidence: { some: { candidate: { sourceId: source.id } } },
      },
      select: { id: true, experienceId: true },
    });
    const experienceIds = [...new Set(affectedFacts.map((fact) => fact.experienceId))];
    if (experienceIds.length > 0) {
      await tx.experienceBrick.updateMany({
        where: { id: { in: experienceIds }, userId: input.userId },
        data: {
          memoryStatus: CareerExperienceStatus.NEEDS_REVIEW,
          embeddingContentHash: null,
          embeddingModel: null,
          embeddedAt: null,
        },
      });
      await tx.careerFact.updateMany({
        where: { experienceId: { in: experienceIds }, userId: input.userId },
        data: {
          active: false,
          embeddingContentHash: null,
          embeddingModel: null,
          embeddedAt: null,
        },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: { careerMemoryVersion: { increment: 1 } },
      });
    }

    await tx.resumeDocumentImport.deleteMany({ where: { sourceId: source.id } });
    await tx.careerSourceChunk.deleteMany({ where: { sourceId: source.id } });
    await tx.careerSource.update({
      where: { id: source.id },
      data: {
        sourceData: null,
        deletedAt: new Date(),
        processingVersion: { increment: 1 },
      },
    });
    return { affectedExperienceIds: experienceIds };
  });
}
