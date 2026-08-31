import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import {
  CareerCandidateStatus,
  ResumeDocumentApplyMode,
  ResumeDocumentImportStatus,
} from "@prisma/client";

import {
  ResumeDocumentCandidatePayloadSchema,
  applyResumeImportCommand,
  canonicalResumeDocumentTargetSectionId,
  isResumeDocumentApplyModeAllowed,
  resumeDocumentPayloadSectionKind,
  type ResumeDocumentImportCommand,
  type ResumeDocumentCandidatePayload,
} from "@/domain/resume-documents/importCandidate";
import type { ResumeDocumentState } from "@/domain/resume-documents/model";
import { prisma } from "@/lib/prisma";
import {
  persistedResumeDocumentResult,
  saveResumeDocumentWithClient,
  validatedResumeDocumentState,
} from "@/lib/services/resume/resumeDocumentPersistenceService";
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

const builtInSectionKinds = new Map<string, ReturnType<typeof resumeDocumentPayloadSectionKind>>([
  ["profile", "identity"],
  ["summary", "narrative"],
  ["experience", "items"],
  ["projects", "items"],
  ["skills", "tags"],
  ["education", "items"],
  ["credentials", "items"],
  ["eligibility", "eligibility"],
]);

function assertBuiltInTargetCompatibility(payload: ResumeDocumentCandidatePayload, targetSectionId: string) {
  const canonicalTarget = canonicalResumeDocumentTargetSectionId(targetSectionId);
  const targetKind = builtInSectionKinds.get(canonicalTarget);
  if (targetKind && resumeDocumentPayloadSectionKind(payload) !== targetKind) {
    throw serviceError(400, "RESUME_DOCUMENT_SECTION_KIND_MISMATCH", "Built-in section is not compatible with the candidate payload");
  }
  return canonicalTarget;
}

function assertCareerRelationshipReviewed(payload: ResumeDocumentCandidatePayload) {
  if (payload.type !== "item" || payload.itemKind !== "career-detail") return;
  if (payload.relatedWorkTitle?.trim() && !payload.relatedWorkItemId?.trim()) {
    throw serviceError(400, "RESUME_DOCUMENT_RELATIONSHIP_REVIEW_REQUIRED", "Career detail relationship must be linked or explicitly independent");
  }
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
    await lockResumeDocumentCandidate(tx, input.candidateId);
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
    const requestedTargetSectionId = input.targetSectionId?.trim() || current.targetSectionId;
    const targetSectionId = assertBuiltInTargetCompatibility(payload, requestedTargetSectionId);
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
    targetSectionId: canonicalResumeDocumentTargetSectionId(candidate.targetSectionId),
    applyMode: candidate.applyMode,
    payload: ResumeDocumentCandidatePayloadSchema.parse(candidate.payload),
    appliedAt: (candidate.decidedAt ?? new Date()).toISOString(),
  };
}

function importApplicationError(error: unknown): never {
  const code = error instanceof Error ? error.message : "RESUME_IMPORT_APPLY_FAILED";
  const known = new Set([
    "RESUME_IMPORT_SECTION_NOT_FOUND",
    "RESUME_IMPORT_SECTION_AMBIGUOUS",
    "RESUME_IMPORT_SECTION_KIND_MISMATCH",
    "RESUME_IMPORT_APPLY_MODE_INVALID",
    "RESUME_IMPORT_COMMAND_HASH_CONFLICT",
    "RESUME_IMPORT_COMMAND_INVALID",
  ]);
  throw serviceError(
    409,
    known.has(code) ? code : "RESUME_IMPORT_APPLY_FAILED",
    known.has(code) ? code : "Resume import could not be applied",
  );
}

async function lockResumeDocumentCandidate(
  client: Prisma.TransactionClient,
  candidateId: string,
) {
  await client.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`resume-document-candidate:${candidateId}`}, 0))
  `;
}

async function lockResumeDocumentUser(
  client: Prisma.TransactionClient,
  userId: string,
) {
  await client.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`resume-document-user:${userId}`}, 0))
  `;
}

export async function applyResumeDocumentCandidate(input: {
  candidateId: string;
  userId: string;
  state: unknown;
  expectedRevision: number;
}) {
  const requestedState = validatedResumeDocumentState(input.state);
  const result = await prisma.$transaction(async (tx) => {
    await lockResumeDocumentCandidate(tx, input.candidateId);
    await lockResumeDocumentUser(tx, input.userId);
    const current = await tx.resumeDocumentCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
      include: candidateInclude,
    });
    if (!current) throw serviceError(404, "RESUME_DOCUMENT_CANDIDATE_NOT_FOUND", "Resume document candidate not found");
    if (current.status === CareerCandidateStatus.REJECTED) {
      throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_DECIDED", "Rejected candidate cannot be applied");
    }
    if (current.appliedAt) {
      const saved = await tx.resumeDocument.findUnique({ where: { userId: input.userId } });
      if (!saved) throw serviceError(409, "RESUME_DOCUMENT_APPLIED_STATE_MISSING", "Applied resume document is missing");
      if (saved.revision !== current.appliedDocumentVersion) {
        throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed after this candidate was applied", { currentRevision: saved.revision });
      }
      return {
        candidate: current,
        document: persistedResumeDocumentResult(saved),
        command: applicationCommand({ ...current, decidedAt: current.decidedAt ?? current.appliedAt! }),
        idempotent: true,
      };
    }

    const payload = ResumeDocumentCandidatePayloadSchema.parse(current.payload);
    if (!isResumeDocumentApplyModeAllowed(payload, current.applyMode)) {
      throw serviceError(400, "RESUME_DOCUMENT_APPLY_MODE_INVALID", "Apply mode is not compatible with the candidate payload");
    }
    assertBuiltInTargetCompatibility(payload, current.targetSectionId);
    assertCareerRelationshipReviewed(payload);

    const decidedAt = current.decidedAt ?? new Date();
    const command = applicationCommand({ ...current, decidedAt }) as ResumeDocumentImportCommand;
    let nextState: ResumeDocumentState;
    try {
      nextState = applyResumeImportCommand(requestedState, command);
    } catch (error) {
      importApplicationError(error);
    }
    const document = await saveResumeDocumentWithClient(tx, {
      userId: input.userId,
      state: nextState,
      expectedRevision: input.expectedRevision,
    });
    const appliedAt = new Date();
    const claimed = await tx.resumeDocumentCandidate.updateMany({
      where: {
        id: current.id,
        userId: input.userId,
        status: { in: [CareerCandidateStatus.PENDING, CareerCandidateStatus.APPROVED] },
        appliedAt: null,
        payloadHash: current.payloadHash,
        updatedAt: current.updatedAt,
      },
      data: {
        status: CareerCandidateStatus.APPROVED,
        reviewedByUserId: input.userId,
        decidedAt,
        appliedAt,
        appliedPayloadHash: current.payloadHash,
        appliedDocumentVersion: document.revision,
      },
    });
    if (claimed.count !== 1) {
      throw serviceError(409, "RESUME_DOCUMENT_CANDIDATE_UPDATE_CONFLICT", "Candidate changed while applying");
    }

    const [pending, unapplied] = await Promise.all([
      tx.resumeDocumentCandidate.count({ where: { importId: current.importId, status: CareerCandidateStatus.PENDING } }),
      tx.resumeDocumentCandidate.count({ where: { importId: current.importId, status: CareerCandidateStatus.APPROVED, appliedAt: null } }),
    ]);
    if (pending === 0 && unapplied === 0) {
      await tx.resumeDocumentImport.updateMany({
        where: { id: current.importId, status: ResumeDocumentImportStatus.REVIEW_REQUIRED },
        data: { status: ResumeDocumentImportStatus.COMPLETE, completedAt: appliedAt },
      });
    }
    return {
      candidate: await tx.resumeDocumentCandidate.findUniqueOrThrow({ where: { id: current.id }, include: candidateInclude }),
      document,
      command,
      idempotent: false,
    };
  });
  return result;
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
    if (wanted === CareerCandidateStatus.APPROVED) {
      assertBuiltInTargetCompatibility(approvedPayload, current.targetSectionId);
      assertCareerRelationshipReviewed(approvedPayload);
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
  const document = await prisma.resumeDocument.findUnique({ where: { userId: input.userId } });
  const documentState = document ? validatedResumeDocumentState(document.payload) : null;
  const ledgerEntry = documentState?.importLedger.find((entry) => entry.candidateKey === `document:${candidate.id}`);
  if (!document || document.revision !== input.documentVersion || ledgerEntry?.payloadHash !== input.payloadHash) {
    throw serviceError(409, "RESUME_DOCUMENT_NOT_DURABLY_APPLIED", "Resume document must be durably saved before acknowledgement");
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
