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

test("pending attributed career details require a reviewed stable relationship before approval", async () => {
  const { user, candidate } = await fixture("relationship-review");
  try {
    const unresolvedPayload: ResumeDocumentCandidatePayload = {
      type: "item", itemKind: "career-detail", detailType: "responsibility", title: "플랫폼 운영", subtitle: "", body: "운영 자동화", relatedWorkTitle: "샘플테크", isCurrent: false, tags: [],
    };
    const unresolved = await updateResumeDocumentCandidate({
      candidateId: candidate.id, userId: user.id, payload: unresolvedPayload, targetSectionId: "careerDescriptions", applyMode: ResumeDocumentApplyMode.APPEND, expectedUpdatedAt: candidate.updatedAt,
    });
    assert.equal(unresolved.targetSectionId, "projects");
    await assert.rejects(
      decideResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, decision: "APPROVE" }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_RELATIONSHIP_REVIEW_REQUIRED",
    );
    const linkedPayload = { ...unresolvedPayload, relatedWorkItemId: "work-sample" };
    await updateResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, payload: linkedPayload, targetSectionId: "projects", applyMode: ResumeDocumentApplyMode.APPEND, expectedUpdatedAt: unresolved.updatedAt });
    const approved = await decideResumeDocumentCandidate({ candidateId: candidate.id, userId: user.id, decision: "APPROVE" });
    assert.equal(approved.command?.targetSectionId, "projects");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("explicitly independent details approve and legacy approved-unapplied candidates remain recoverable", async () => {
  const independentFixture = await fixture("independent-detail");
  try {
    const independent: ResumeDocumentCandidatePayload = { type: "item", itemKind: "career-detail", detailType: "project", title: "오픈소스", subtitle: "", body: "기여", isCurrent: false, tags: [] };
    await updateResumeDocumentCandidate({ candidateId: independentFixture.candidate.id, userId: independentFixture.user.id, payload: independent, targetSectionId: "credentials", applyMode: ResumeDocumentApplyMode.APPEND, expectedUpdatedAt: independentFixture.candidate.updatedAt });
    const approved = await decideResumeDocumentCandidate({ candidateId: independentFixture.candidate.id, userId: independentFixture.user.id, decision: "APPROVE" });
    assert.equal(approved.command?.targetSectionId, "credentials");
    assert.equal((approved.command?.payload as { itemKind?: string }).itemKind, "career-detail");
  } finally {
    await prisma.user.delete({ where: { id: independentFixture.user.id } });
  }

  const legacyFixture = await fixture("legacy-approved");
  try {
    const legacyPayload = { type: "item", itemKind: "career-description", title: "운영 책임", subtitle: "", body: "운영", relatedWorkTitle: "예전회사", isCurrent: false, tags: [] };
    await prisma.resumeDocumentCandidate.update({ where: { id: legacyFixture.candidate.id }, data: { status: CareerCandidateStatus.APPROVED, targetSectionId: "careerDescriptions", targetSectionKind: "items", applyMode: ResumeDocumentApplyMode.APPEND, payload: legacyPayload, payloadHash: resumeDocumentPayloadHash(legacyPayload as ResumeDocumentCandidatePayload), decidedAt: new Date() } });
    const recovered = await decideResumeDocumentCandidate({ candidateId: legacyFixture.candidate.id, userId: legacyFixture.user.id, decision: "APPROVE" });
    assert.equal(recovered.idempotent, true);
    assert.equal(recovered.command?.targetSectionId, "projects");
    assert.equal((recovered.command?.payload as { itemKind?: string }).itemKind, "career-detail");
  } finally {
    await prisma.user.delete({ where: { id: legacyFixture.user.id } });
  }
});
