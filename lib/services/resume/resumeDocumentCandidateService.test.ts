import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CareerCandidateStatus,
  ResumeDocumentApplyMode,
  ResumeDocumentCandidateKind,
  ResumeDocumentImportStatus,
} from "@prisma/client";

import type { ResumeDocumentCandidatePayload } from "@/domain/resume-documents/importCandidate";
import { prisma } from "@/lib/prisma";
import {
  acknowledgeResumeDocumentCandidateApplied,
  decideResumeDocumentCandidate,
  resumeDocumentPayloadHash,
  updateResumeDocumentCandidate,
} from "./resumeDocumentCandidateService";

async function fixture(label: string) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `resume-import-${label}-${suffix}`, label: `Resume import ${label}`, email: `resume-import-${label}-${suffix}@example.com` },
  });
  const source = await prisma.careerSource.create({
    data: {
      userId: user.id,
      originalName: "jobkorea.pdf",
      mimeType: "application/pdf",
      checksum: randomUUID().replaceAll("-", ""),
      byteSize: 10,
      status: "READY",
    },
  });
  const importTask = await prisma.resumeDocumentImport.create({
    data: { userId: user.id, sourceId: source.id, status: ResumeDocumentImportStatus.REVIEW_REQUIRED, candidateCount: 1 },
  });
  const payload: ResumeDocumentCandidatePayload = { type: "identity-field", field: "name", value: "홍길동" };
  const candidate = await prisma.resumeDocumentCandidate.create({
    data: {
      importId: importTask.id,
      userId: user.id,
      kind: ResumeDocumentCandidateKind.IDENTITY_FIELD,
      recommendedSectionId: "profile",
      targetSectionId: "profile",
      targetSectionKind: "identity",
      applyMode: ResumeDocumentApplyMode.FILL_EMPTY,
      payload,
      payloadHash: resumeDocumentPayloadHash(payload),
      status: CareerCandidateStatus.PENDING,
    },
  });
  return { user, importTask, candidate };
}

test("document candidates are editable only while pending and approval stays unapplied until acknowledgement", async () => {
  const { user, importTask, candidate } = await fixture("approve");
  try {
    const updated = await updateResumeDocumentCandidate({
      candidateId: candidate.id,
      userId: user.id,
      payload: { type: "identity-field", field: "name", value: "김민지" },
      targetSectionId: "profile",
      applyMode: ResumeDocumentApplyMode.REPLACE,
      expectedUpdatedAt: candidate.updatedAt,
    });
    const first = await decideResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, decision: "APPROVE" });
    assert.equal(first.command?.payloadHash, updated.payloadHash);
    assert.equal(first.candidate.appliedAt, null);
    const second = await decideResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, decision: "APPROVE" });
    assert.equal(second.idempotent, true);

    await assert.rejects(
      acknowledgeResumeDocumentCandidateApplied({ candidateId: candidate.id, userId: user.id, payloadHash: "wrong", documentVersion: 5 }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_CANDIDATE_HASH_CONFLICT",
    );
    const applied = await acknowledgeResumeDocumentCandidateApplied({
      candidateId: candidate.id,
      userId: user.id,
      payloadHash: updated.payloadHash,
      documentVersion: 5,
    });
    assert.ok(applied.appliedAt);
    assert.equal((await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id } })).status, ResumeDocumentImportStatus.COMPLETE);
    await assert.rejects(
      updateResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, payload: { type: "identity-field", field: "name", value: "변경 불가" } }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_CANDIDATE_DECIDED",
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("rejection requires a reason and never produces an application command", async () => {
  const { user, candidate } = await fixture("reject");
  try {
    await assert.rejects(
      decideResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, decision: "REJECT" }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_REJECTION_REASON_REQUIRED",
    );
    const rejected = await decideResumeDocumentCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "REJECT",
      rejectionReason: "사용자가 제외함",
    });
    assert.equal(rejected.command, null);
    assert.equal(rejected.candidate.status, CareerCandidateStatus.REJECTED);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
