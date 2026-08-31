import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CareerCandidateStatus,
  ResumeDocumentApplyMode,
  ResumeDocumentCandidateKind,
  ResumeDocumentImportStatus,
} from "@prisma/client";

import {
  applyResumeImportCommand,
  type ResumeDocumentCandidatePayload,
} from "@/domain/resume-documents/importCandidate";
import {
  createResumeDocumentSeed,
  updateSharedSectionTitle,
} from "@/domain/resume-documents/model";
import { prisma } from "@/lib/prisma";
import {
  acknowledgeResumeDocumentCandidateApplied,
  applyResumeDocumentCandidate,
  decideResumeDocumentCandidate,
  resumeDocumentPayloadHash,
  updateResumeDocumentCandidate,
} from "./resumeDocumentCandidateService";
import { saveResumeDocument } from "./resumeDocumentPersistenceService";

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
    await assert.rejects(
      acknowledgeResumeDocumentCandidateApplied({ candidateId: candidate.id, userId: user.id, payloadHash: updated.payloadHash, documentVersion: 1 }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_NOT_DURABLY_APPLIED",
    );
    assert.ok(first.command);
    const saved = await saveResumeDocument({
      userId: user.id,
      state: applyResumeImportCommand(createResumeDocumentSeed(), first.command),
      expectedRevision: 0,
    });
    const applied = await acknowledgeResumeDocumentCandidateApplied({
      candidateId: candidate.id,
      userId: user.id,
      payloadHash: updated.payloadHash,
      documentVersion: saved.revision,
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

test("candidate application saves the document and approval at the same persisted revision", async () => {
  const { user, importTask, candidate } = await fixture("atomic-apply");
  try {
    await prisma.resumeDocumentCandidate.update({
      where: { id: candidate.id },
      data: { applyMode: ResumeDocumentApplyMode.REPLACE },
    });
    const applied = await applyResumeDocumentCandidate({
      candidateId: candidate.id,
      userId: user.id,
      state: createResumeDocumentSeed(),
      expectedRevision: 0,
    });
    const profile = applied.document.state.sharedSections.find((section) => section.id === "profile");
    assert.equal((profile?.content as { name?: string }).name, "홍길동");
    assert.equal(applied.document.revision, 1);
    assert.equal(applied.candidate.status, CareerCandidateStatus.APPROVED);
    assert.equal(applied.candidate.appliedDocumentVersion, applied.document.revision);
    assert.ok(applied.candidate.appliedAt);
    assert.equal((await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id } })).status, ResumeDocumentImportStatus.COMPLETE);

    const retry = await applyResumeDocumentCandidate({
      candidateId: candidate.id,
      userId: user.id,
      state: createResumeDocumentSeed(),
      expectedRevision: 0,
    });
    assert.equal(retry.idempotent, true);
    assert.equal(retry.document.revision, applied.document.revision);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("concurrent applications of the same candidate are serialized and idempotent", async () => {
  const { user, candidate } = await fixture("concurrent-apply");
  try {
    await prisma.resumeDocumentCandidate.update({
      where: { id: candidate.id },
      data: { applyMode: ResumeDocumentApplyMode.REPLACE },
    });
    const input = {
      candidateId: candidate.id,
      userId: user.id,
      state: createResumeDocumentSeed(),
      expectedRevision: 0,
    };

    const results = await Promise.all([
      applyResumeDocumentCandidate(input),
      applyResumeDocumentCandidate(input),
    ]);

    assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
    assert.deepEqual(results.map((result) => result.document.revision), [1, 1]);
    assert.ok(results.every((result) => result.command.candidateKey === `document:${candidate.id}`));
    assert.equal(await prisma.resumeDocument.count({ where: { userId: user.id } }), 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("retrying an applied candidate cannot return and overwrite a document changed afterward", async () => {
  const { user, candidate } = await fixture("applied-retry-after-edit");
  try {
    await prisma.resumeDocumentCandidate.update({
      where: { id: candidate.id },
      data: { applyMode: ResumeDocumentApplyMode.REPLACE },
    });
    const requestedState = createResumeDocumentSeed();
    const applied = await applyResumeDocumentCandidate({
      candidateId: candidate.id,
      userId: user.id,
      state: requestedState,
      expectedRevision: 0,
    });
    await saveResumeDocument({
      userId: user.id,
      state: updateSharedSectionTitle(applied.document.state, "summary", "후속 서버 편집"),
      expectedRevision: applied.document.revision,
    });

    await assert.rejects(
      applyResumeDocumentCandidate({
        candidateId: candidate.id,
        userId: user.id,
        state: requestedState,
        expectedRevision: 0,
      }),
      (error: unknown) => {
        const value = error as { code?: string; details?: { currentRevision?: number } };
        return value.code === "RESUME_DOCUMENT_CONFLICT" && value.details?.currentRevision === 2;
      },
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("different candidates for one document cannot create competing first revisions", async () => {
  const { user, importTask, candidate } = await fixture("concurrent-document");
  try {
    await prisma.resumeDocumentCandidate.update({
      where: { id: candidate.id },
      data: { applyMode: ResumeDocumentApplyMode.REPLACE },
    });
    const emailPayload: ResumeDocumentCandidatePayload = { type: "identity-field", field: "email", value: "candidate@example.com" };
    const second = await prisma.resumeDocumentCandidate.create({
      data: {
        importId: importTask.id,
        userId: user.id,
        kind: ResumeDocumentCandidateKind.IDENTITY_FIELD,
        recommendedSectionId: "profile",
        targetSectionId: "profile",
        targetSectionKind: "identity",
        applyMode: ResumeDocumentApplyMode.REPLACE,
        payload: emailPayload,
        payloadHash: resumeDocumentPayloadHash(emailPayload),
        status: CareerCandidateStatus.PENDING,
      },
    });
    const baseInput = { userId: user.id, state: createResumeDocumentSeed(), expectedRevision: 0 };

    const results = await Promise.allSettled([
      applyResumeDocumentCandidate({ ...baseInput, candidateId: candidate.id }),
      applyResumeDocumentCandidate({ ...baseInput, candidateId: second.id }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejection?.reason as { code?: string }).code, "RESUME_DOCUMENT_CONFLICT");
    assert.equal(await prisma.resumeDocument.count({ where: { userId: user.id } }), 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("missing targets and stale document revisions leave candidates pending and documents unchanged", async () => {
  const missing = await fixture("missing-target");
  try {
    await prisma.resumeDocumentCandidate.update({
      where: { id: missing.candidate.id },
      data: { targetSectionId: "removed-custom-identity" },
    });
    await assert.rejects(
      applyResumeDocumentCandidate({
        candidateId: missing.candidate.id,
        userId: missing.user.id,
        state: createResumeDocumentSeed(),
        expectedRevision: 0,
      }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_IMPORT_SECTION_NOT_FOUND",
    );
    assert.equal((await prisma.resumeDocumentCandidate.findUniqueOrThrow({ where: { id: missing.candidate.id } })).status, CareerCandidateStatus.PENDING);
    assert.equal(await prisma.resumeDocument.findUnique({ where: { userId: missing.user.id } }), null);
  } finally {
    await prisma.user.delete({ where: { id: missing.user.id } });
  }

  const conflict = await fixture("atomic-conflict");
  try {
    const first = await saveResumeDocument({ userId: conflict.user.id, state: createResumeDocumentSeed(), expectedRevision: 0 });
    await saveResumeDocument({
      userId: conflict.user.id,
      state: updateSharedSectionTitle(first.state, "summary", "다른 기기에서 저장한 소개"),
      expectedRevision: first.revision,
    });
    await assert.rejects(
      applyResumeDocumentCandidate({
        candidateId: conflict.candidate.id,
        userId: conflict.user.id,
        state: first.state,
        expectedRevision: first.revision,
      }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_CONFLICT",
    );
    assert.equal((await prisma.resumeDocumentCandidate.findUniqueOrThrow({ where: { id: conflict.candidate.id } })).status, CareerCandidateStatus.PENDING);
    assert.equal((await prisma.resumeDocument.findUniqueOrThrow({ where: { userId: conflict.user.id } })).revision, 2);
  } finally {
    await prisma.user.delete({ where: { id: conflict.user.id } });
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

test("rejection remains an exit path when a stored candidate no longer matches the current payload schema", async () => {
  const { user, importTask, candidate } = await fixture("reject-invalid-payload");
  try {
    await prisma.resumeDocumentCandidate.update({
      where: { id: candidate.id },
      data: {
        payload: { legacyType: "no-longer-supported", value: null },
        payloadHash: "legacy-invalid-payload",
      },
    });

    const rejected = await decideResumeDocumentCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "REJECT",
      rejectionReason: "현재 규칙으로 검토할 수 없는 후보",
    });

    assert.equal(rejected.command, null);
    assert.equal(rejected.candidate.status, CareerCandidateStatus.REJECTED);
    assert.equal(
      (await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id } })).status,
      ResumeDocumentImportStatus.COMPLETE,
    );
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
