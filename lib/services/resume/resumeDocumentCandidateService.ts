import { createHash } from "node:crypto";

import {
  CareerCandidateStatus,
  ResumeDocumentApplyMode,
  ResumeDocumentImportStatus,
} from "@prisma/client";

import {
  ResumeDocumentCandidatePayloadSchema,
  isResumeDocumentApplyModeAllowed,
  resumeDocumentPayloadSectionKind,
  type ResumeDocumentCandidatePayload,
} from "@/domain/resume-documents/importCandidate";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

const candidateInclude = {
  evidence: {
    include: { sourceChunk: { select: { id: true, pageStart: true, pageEnd: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  importTask: { select: { id: true, sourceId: true, status: true } },
} as const;

export function resumeDocumentPayloadHash(payload: ResumeDocumentCandidatePayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function listResumeDocumentCandidates(input: {
  userId: string;
  importId?: string;
  status?: CareerCandidateStatus;
  pendingApplication?: boolean;
}) {
  return prisma.resumeDocumentCandidate.findMany({
    where: {
      userId: input.userId,
      importId: input.importId,
      status: input.status,
      ...(input.pendingApplication
        ? { status: CareerCandidateStatus.APPROVED, appliedAt: null }
        : {}),
    },
    include: candidateInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function updateResumeDocumentCandidate(input: {
  candidateId: string;
  userId: string;
  payload?: unknown;
  targetSectionId?: string;
  applyMode?: ResumeDocumentApplyMode;
  expectedUpdatedAt?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.resumeDocumentCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
    });
    if (!current) throw serviceError(404, "RESUME_DOCUMENT_CANDIDATE_NOT_FOUND", "Resume document candidate not found");
    if (current.status !== CareerCandidateStatus.PENDING) {
      throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_DECIDED", "Decided candidate cannot be edited");
    }
    const payload = input.payload === undefined
      ? ResumeDocumentCandidatePayloadSchema.parse(current.payload)
      : ResumeDocumentCandidatePayloadSchema.parse(input.payload);
    const targetSectionId = input.targetSectionId?.trim() || current.targetSectionId;
    const applyMode = input.applyMode ?? current.applyMode;
    if (!isResumeDocumentApplyModeAllowed(payload, applyMode)) {
      throw serviceError(400, "RESUME_DOCUMENT_APPLY_MODE_INVALID", "Apply mode is not compatible with the candidate payload");
    }
    const expected = input.expectedUpdatedAt ?? current.updatedAt;
    const changed = await tx.resumeDocumentCandidate.updateMany({
      where: {
        id: current.id,
        userId: input.userId,
        status: CareerCandidateStatus.PENDING,
        updatedAt: expected,
      },
      data: {
        payload,
        payloadHash: resumeDocumentPayloadHash(payload),
        targetSectionId,
        targetSectionKind: resumeDocumentPayloadSectionKind(payload),
        applyMode,
      },
    });
    if (changed.count !== 1) {
      throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_UPDATE_CONFLICT", "Candidate changed while it was being edited");
    }
    return tx.resumeDocumentCandidate.findUniqueOrThrow({ where: { id: current.id }, include: candidateInclude });
  });
}

function applicationCommand(candidate: {
  id: string;
  payloadHash: string;
  targetSectionId: string;
  applyMode: ResumeDocumentApplyMode;
  payload: unknown;
  decidedAt: Date | null;
}) {
  return {
    candidateKey: `document:${candidate.id}`,
    payloadHash: candidate.payloadHash,
    targetSectionId: candidate.targetSectionId,
    applyMode: candidate.applyMode,
    payload: ResumeDocumentCandidatePayloadSchema.parse(candidate.payload),
    appliedAt: (candidate.decidedAt ?? new Date()).toISOString(),
  };
}

async function updateImportCompletion(importId: string) {
  const [pending, unapplied] = await Promise.all([
    prisma.resumeDocumentCandidate.count({ where: { importId, status: CareerCandidateStatus.PENDING } }),
    prisma.resumeDocumentCandidate.count({ where: { importId, status: CareerCandidateStatus.APPROVED, appliedAt: null } }),
  ]);
  if (pending === 0 && unapplied === 0) {
    await prisma.resumeDocumentImport.updateMany({
      where: { id: importId, status: ResumeDocumentImportStatus.REVIEW_REQUIRED },
      data: { status: ResumeDocumentImportStatus.COMPLETE, completedAt: new Date() },
    });
  }
}

export async function decideResumeDocumentCandidate(input: {
  candidateId: string;
  userId: string;
  decision: "APPROVE" | "REJECT";
  rejectionReason?: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.resumeDocumentCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
      include: candidateInclude,
    });
    if (!current) throw serviceError(404, "RESUME_DOCUMENT_CANDIDATE_NOT_FOUND", "Resume document candidate not found");
    const wanted = input.decision === "APPROVE" ? CareerCandidateStatus.APPROVED : CareerCandidateStatus.REJECTED;
    if (current.status !== CareerCandidateStatus.PENDING) {
      if (current.status !== wanted) {
        throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_DECIDED", "Candidate was already decided differently");
      }
      return {
        candidate: current,
        command: wanted === CareerCandidateStatus.APPROVED ? applicationCommand(current) : null,
        idempotent: true,
      };
    }
    const reason = input.rejectionReason?.trim();
    if (wanted === CareerCandidateStatus.REJECTED && !reason) {
      throw serviceError(400, "RESUME_DOCUMENT_REJECTION_REASON_REQUIRED", "Rejection reason is required");
    }
    const approvedPayload = ResumeDocumentCandidatePayloadSchema.parse(current.payload);
    if (!isResumeDocumentApplyModeAllowed(approvedPayload, current.applyMode)) {
      throw serviceError(400, "RESUME_DOCUMENT_APPLY_MODE_INVALID", "Apply mode is not compatible with the candidate payload");
    }
    const decidedAt = new Date();
    const claim = await tx.resumeDocumentCandidate.updateMany({
      where: { id: current.id, userId: input.userId, status: CareerCandidateStatus.PENDING },
      data: {
        status: wanted,
        reviewedByUserId: input.userId,
        decidedAt,
        rejectionReason: wanted === CareerCandidateStatus.REJECTED ? reason : null,
      },
    });
    if (claim.count !== 1) throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_UPDATE_CONFLICT", "Candidate changed while deciding");
    const candidate = await tx.resumeDocumentCandidate.findUniqueOrThrow({ where: { id: current.id }, include: candidateInclude });
    return {
      candidate,
      command: wanted === CareerCandidateStatus.APPROVED ? applicationCommand(candidate) : null,
      idempotent: false,
    };
  });
  if (input.decision === "REJECT") await updateImportCompletion(result.candidate.importId);
  return result;
}

export async function acknowledgeResumeDocumentCandidateApplied(input: {
  candidateId: string;
  userId: string;
  payloadHash: string;
  documentVersion: number;
}) {
  const candidate = await prisma.resumeDocumentCandidate.findFirst({
    where: { id: input.candidateId, userId: input.userId },
  });
  if (!candidate) throw serviceError(404, "RESUME_DOCUMENT_CANDIDATE_NOT_FOUND", "Resume document candidate not found");
  if (candidate.status !== CareerCandidateStatus.APPROVED) {
    throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_NOT_APPROVED", "Only approved candidates can be applied");
  }
  if (candidate.payloadHash !== input.payloadHash) {
    throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_HASH_CONFLICT", "Approved payload hash does not match");
  }
  if (!Number.isSafeInteger(input.documentVersion) || input.documentVersion < 1) {
    throw serviceError(400, "RESUME_DOCUMENT_VERSION_INVALID", "Document version is invalid");
  }
  if (!candidate.appliedAt) {
    await prisma.resumeDocumentCandidate.updateMany({
      where: { id: candidate.id, userId: input.userId, status: CareerCandidateStatus.APPROVED, appliedAt: null },
      data: {
        appliedAt: new Date(),
        appliedPayloadHash: input.payloadHash,
        appliedDocumentVersion: input.documentVersion,
      },
    });
  } else if (candidate.appliedPayloadHash !== input.payloadHash) {
    throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_HASH_CONFLICT", "Applied payload hash does not match");
  }
  await updateImportCompletion(candidate.importId);
  return prisma.resumeDocumentCandidate.findUniqueOrThrow({ where: { id: candidate.id }, include: candidateInclude });
}
