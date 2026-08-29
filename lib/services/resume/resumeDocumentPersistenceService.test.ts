import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  addSharedSection,
  createResumeDocumentSeed,
  deleteSharedSection,
  updateSharedSection,
  updateSharedSectionTitle,
} from "@/domain/resume-documents/model";
import { prisma } from "@/lib/prisma";
import {
  getResumeDocument,
  saveResumeDocument,
} from "./resumeDocumentPersistenceService";

async function createUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `resume-document-${label}-${suffix}`,
      label: `Resume document ${label}`,
      email: `resume-document-${label}-${suffix}@example.com`,
    },
  });
}

test("the versioned document aggregate preserves flexible section create, edit, and delete operations", async () => {
  const user = await createUser("section-crud");
  try {
    const created = addSharedSection(createResumeDocumentSeed(), {
      title: "오픈소스 활동",
      kind: "narrative",
      afterSectionId: "projects",
    });
    const first = await saveResumeDocument({ userId: user.id, state: created.state, expectedRevision: 0 });
    assert.equal(first.revision, 1);
    assert.equal(first.state.sharedSections.find((section) => section.id === created.section.id)?.title, "오픈소스 활동");

    const editedState = updateSharedSectionTitle(
      updateSharedSection(first.state, created.section.id, { body: "라이브러리 유지보수와 커뮤니티 기여" }),
      created.section.id,
      "기술 커뮤니티",
    );
    const second = await saveResumeDocument({ userId: user.id, state: editedState, expectedRevision: first.revision });
    const edited = (await getResumeDocument(user.id))!;
    const editedSection = edited.state.sharedSections.find((section) => section.id === created.section.id);
    assert.equal(second.revision, 2);
    assert.equal(editedSection?.title, "기술 커뮤니티");
    assert.deepEqual(editedSection?.content, { body: "라이브러리 유지보수와 커뮤니티 기여" });

    const deletedState = deleteSharedSection(edited.state, created.section.id);
    const third = await saveResumeDocument({ userId: user.id, state: deletedState, expectedRevision: edited.revision });
    assert.equal(third.revision, 3);
    assert.equal((await getResumeDocument(user.id))?.state.sharedSections.some((section) => section.id === created.section.id), false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("document persistence rejects invalid payloads and stale revisions without overwriting the saved state", async () => {
  const user = await createUser("conflict");
  try {
    await assert.rejects(
      saveResumeDocument({ userId: user.id, state: { version: 5 }, expectedRevision: 0 }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_INVALID",
    );

    const initial = await saveResumeDocument({ userId: user.id, state: createResumeDocumentSeed(), expectedRevision: 0 });
    const changed = updateSharedSectionTitle(initial.state, "summary", "서버에 저장된 소개");
    await saveResumeDocument({ userId: user.id, state: changed, expectedRevision: initial.revision });

    await assert.rejects(
      saveResumeDocument({ userId: user.id, state: initial.state, expectedRevision: initial.revision }),
      (error: unknown) => {
        const value = error as { code?: string; details?: { currentRevision?: number } };
        return value.code === "RESUME_DOCUMENT_CONFLICT" && value.details?.currentRevision === 2;
      },
    );
    assert.equal((await getResumeDocument(user.id))?.state.sharedSections.find((section) => section.id === "summary")?.title, "서버에 저장된 소개");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("concurrent first saves produce one document and one domain conflict", async () => {
  const user = await createUser("first-save-race");
  try {
    const firstState = updateSharedSectionTitle(createResumeDocumentSeed(), "summary", "첫 번째 탭");
    const secondState = updateSharedSectionTitle(createResumeDocumentSeed(), "summary", "두 번째 탭");
    const results = await Promise.allSettled([
      saveResumeDocument({ userId: user.id, state: firstState, expectedRevision: 0 }),
      saveResumeDocument({ userId: user.id, state: secondState, expectedRevision: 0 }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejected?.reason as { code?: string }).code, "RESUME_DOCUMENT_CONFLICT");
    assert.equal((await getResumeDocument(user.id))?.revision, 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("replaying an acknowledged document snapshot is idempotent without hiding later edits", async () => {
  const user = await createUser("idempotent-replay");
  try {
    const firstState = updateSharedSectionTitle(createResumeDocumentSeed(), "summary", "첫 저장");
    const first = await saveResumeDocument({ userId: user.id, state: firstState, expectedRevision: 0 });

    const lostResponseRetry = await saveResumeDocument({ userId: user.id, state: structuredClone(firstState), expectedRevision: 0 });
    const noOpAtCurrentRevision = await saveResumeDocument({ userId: user.id, state: firstState, expectedRevision: first.revision });
    assert.equal(lostResponseRetry.revision, first.revision);
    assert.equal(noOpAtCurrentRevision.revision, first.revision);

    const secondState = updateSharedSectionTitle(firstState, "summary", "다른 브라우저의 저장");
    const second = await saveResumeDocument({ userId: user.id, state: secondState, expectedRevision: first.revision });
    assert.equal(second.revision, first.revision + 1);

    await assert.rejects(
      saveResumeDocument({ userId: user.id, state: firstState, expectedRevision: 0 }),
      (error: unknown) => (error as { code?: string }).code === "RESUME_DOCUMENT_CONFLICT",
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
