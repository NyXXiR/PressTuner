import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { hashArticleContent } from "@/domain/article/articleContentHash";
import { PressDomainError } from "@/domain/press/pressProcess";
import { prisma } from "@/lib/prisma";
import { finalizeVerifiedArticle } from "@/lib/services/article/articleFinalizationService";
import { saveDraftUseCase } from "@/lib/services/article/generationUseCases";
import { withLockedPressProcess } from "./adapters/pressProcessPrismaAdapter";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `press-lock-${suffix}`, label: "Press lock" },
  });
  const team = await prisma.team.create({
    data: { slug: `press-lock-${suffix}`, name: "Press lock" },
  });
  const bodyJson = { paragraphs: [{ text: "verified" }], closing: "" };
  const article = await prisma.article.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "PRESS_RELEASE",
      status: "IN_PROGRESS",
      title: "Verified draft",
      bodyJson,
    },
  });
  await prisma.articleVerification.create({
    data: {
      articleId: article.id,
      teamId: team.id,
      draftHash: hashArticleContent({
        title: article.title,
        bodyJson: { lead: "", fact: "", ...bodyJson },
      }),
      groundingRevision: 0,
      corpusVersion: 0,
      verifierVersion: "test",
      modelVersion: "test",
      result: "PASS",
    },
  });
  return { user, team, article };
}

test("a save queued behind FINAL rejects without changing content", async () => {
  const { user, team, article } = await fixture();
  const locked = deferred();
  const release = deferred();
  try {
    const finalWrite = withLockedPressProcess(
      { articleId: article.id, teamId: team.id },
      async ({ tx }) => {
        await tx.article.update({ where: { id: article.id }, data: { status: "FINAL" } });
        locked.resolve();
        await release.promise;
      },
    );
    await locked.promise;
    const lateSave = saveDraftUseCase({
      teamId: team.id,
      userId: user.id,
      articleId: article.id,
      patch: { title: "late write" },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    release.resolve();
    await finalWrite;
    await assert.rejects(lateSave, (error: unknown) =>
      error instanceof PressDomainError && error.code === "PRESS_FINALIZED_IMMUTABLE");
    const persisted = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    assert.equal(persisted.status, "FINAL");
    assert.equal(persisted.title, "Verified draft");
  } finally {
    release.resolve();
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("two already-started finalizations have one winner and one stable conflict", async () => {
  const { user, team, article } = await fixture();
  const locked = deferred();
  const release = deferred();
  try {
    const gate = withLockedPressProcess(
      { articleId: article.id, teamId: team.id },
      async () => { locked.resolve(); await release.promise; },
    );
    await locked.promise;
    const attempts = [
      finalizeVerifiedArticle({ articleId: article.id, teamId: team.id }),
      finalizeVerifiedArticle({ articleId: article.id, teamId: team.id }),
    ];
    await new Promise((resolve) => setTimeout(resolve, 25));
    release.resolve();
    await gate;
    const results = await Promise.allSettled(attempts);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    const rejected = results.find(({ status }) => status === "rejected");
    assert.equal(rejected?.status, "rejected");
    if (rejected?.status === "rejected") {
      assert.ok(rejected.reason instanceof PressDomainError);
      assert.equal(rejected.reason.code, "PRESS_FINALIZED_IMMUTABLE");
      assert.equal(rejected.reason.status, 409);
    }
  } finally {
    release.resolve();
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("a finalization that starts after FINAL remains idempotent", async () => {
  const { user, team, article } = await fixture();
  try {
    const first = await finalizeVerifiedArticle({
      articleId: article.id,
      teamId: team.id,
    });
    const repeated = await finalizeVerifiedArticle({
      articleId: article.id,
      teamId: team.id,
    });

    assert.equal(first.article.status, "FINAL");
    assert.equal(repeated.article.status, "FINAL");
    assert.equal(repeated.article.id, article.id);
    assert.equal(repeated.verificationId, first.verificationId);
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("finalization queued behind a content edit reloads and rejects stale verification", async () => {
  const { user, team, article } = await fixture();
  const locked = deferred();
  const release = deferred();
  try {
    const edit = withLockedPressProcess(
      { articleId: article.id, teamId: team.id },
      async ({ tx }) => {
        await tx.article.update({ where: { id: article.id }, data: { title: "new content" } });
        locked.resolve();
        await release.promise;
      },
    );
    await locked.promise;
    const finalization = finalizeVerifiedArticle({ articleId: article.id, teamId: team.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    release.resolve();
    await edit;
    await assert.rejects(finalization, (error: unknown) =>
      error instanceof PressDomainError && error.code === "ARTICLE_VERIFICATION_STALE");
  } finally {
    release.resolve();
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("different article IDs do not share an advisory lock", async () => {
  const first = await fixture();
  const second = await fixture();
  const locked = deferred();
  const release = deferred();
  try {
    const held = withLockedPressProcess(
      { articleId: first.article.id, teamId: first.team.id },
      async () => { locked.resolve(); await release.promise; },
    );
    await locked.promise;
    const other = withLockedPressProcess(
      { articleId: second.article.id, teamId: second.team.id },
      async () => "completed",
    );
    assert.equal(await Promise.race([
      other,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("other article blocked")), 500)),
    ]), "completed");
    release.resolve();
    await held;
  } finally {
    release.resolve();
    await prisma.team.deleteMany({ where: { id: { in: [first.team.id, second.team.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [first.user.id, second.user.id] } } });
  }
});
