import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PressDomainError } from "@/domain/press/pressProcess";
import { prisma } from "@/lib/prisma";
import { finalizeVerifiedArticle } from "./articleFinalizationService";
import { verifyArticle } from "./articleVerificationService";

async function fixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `efc-verification-${suffix}`, label: "EFC verification" } });
  const team = await prisma.team.create({ data: { slug: `efc-verification-${suffix}`, name: "EFC verification" } });
  const article = await prisma.article.create({ data: {
    teamId: team.id, userId: user.id, status: "IN_PROGRESS", title: "Bridge 실적",
    bodyJson: { paragraphs: [{ text: "Bridge는 2026년 매출 360억원을 기록했습니다." }] },
  } });
  const document = await prisma.knowledgeDocument.create({ data: {
    teamId: team.id, originalName: "bridge-revenue.pdf", mimeType: "application/pdf", byteSize: 100,
    storageKey: `efc-verification/${suffix}.pdf`, checksum: suffix, status: "READY", classificationOverride: "FACT",
  } });
  const generation = await prisma.knowledgeIndexGeneration.create({ data: {
    documentId: document.id, generation: 1, fingerprint: suffix, parserVersion: "test", chunkerVersion: "test",
    embeddingModel: "test", embeddingDimensions: 1536, indexStatus: "READY", classificationStatus: "READY",
  } });
  const chunk = await prisma.knowledgeChunk.create({ data: {
    teamId: team.id, documentId: document.id, generationId: generation.id, ordinal: 0,
    content: "Bridge는 2026년 매출 200억원을 기록했다.", pageStart: 2, pageEnd: 2,
    contentHash: suffix, parserVersion: "test", autoRole: "FACT",
  } });
  await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { activeGenerationId: generation.id } });
  return { user, team, article, document, chunk };
}

test("automatic contradiction blocks, corrected verification passes, and final citation retains lineage", async () => {
  const { user, team, article, document, chunk } = await fixture();
  const acceptedIds: string[][] = [];
  const complete = async (_system: string, _user: string, ids: readonly string[] = []) => {
    acceptedIds.push([...ids]);
    return JSON.stringify({ findings: [] });
  };
  const loadContexts = async () => ({ facts: "", stylePolicy: "", styleExamples: "" });
  try {
    const blocked = await verifyArticle({ articleId: article.id, teamId: team.id, complete, loadContexts });
    assert.equal(blocked.result, "BLOCK");
    assert.equal(blocked.findings[0]?.claim, "DRAFT_CONFLICT");
    assert.ok(acceptedIds[0]?.some((id) => id.startsWith("efc:")));
    assert.ok(blocked.findings[0]?.evidenceFactIds.every((id) => !id.startsWith("efc:")));
    await assert.rejects(
      finalizeVerifiedArticle({ articleId: article.id, teamId: team.id }),
      (error: unknown) => error instanceof PressDomainError && error.code === "ARTICLE_VERIFICATION_BLOCKED",
    );

    await prisma.article.update({ where: { id: article.id }, data: {
      bodyJson: { paragraphs: [{ text: "Bridge는 2026년 매출 20,000,000,000원을 기록했습니다." }] },
    } });
    const passed = await verifyArticle({ articleId: article.id, teamId: team.id, complete, loadContexts });
    assert.equal(passed.result, "PASS");
    const finalized = await finalizeVerifiedArticle({ articleId: article.id, teamId: team.id });
    assert.equal(finalized.article.status, "FINAL");
    const citations = await prisma.articleFinalCitation.findMany({ where: { articleId: article.id } });
    assert.deepEqual(citations.map(({ documentId, chunkId, pageStart, pageEnd, excerpt }) => ({ documentId, chunkId, pageStart, pageEnd, excerpt })), [{
      documentId: document.id,
      chunkId: chunk.id,
      pageStart: 2,
      pageEnd: 2,
      excerpt: "Bridge는 2026년 매출 200억원을 기록했다.",
    }]);
  } finally {
    await prisma.articleFinalCitation.deleteMany({ where: { articleId: article.id } });
    await prisma.articleDraftEvidence.deleteMany({ where: { articleId: article.id } });
    await prisma.article.deleteMany({ where: { id: article.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("personal articles do not scan team knowledge", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `efc-personal-${suffix}`, label: "EFC personal" } });
  const article = await prisma.article.create({ data: { userId: user.id, status: "DRAFT", title: "개인 원고", bodyJson: { paragraphs: [{ text: "2026년 매출 360억원" }] } } });
  try {
    const verification = await verifyArticle({ articleId: article.id, teamId: null, complete: async () => JSON.stringify({ findings: [] }) });
    assert.equal(verification.result, "PASS");
    assert.equal(await prisma.articleFact.count({ where: { articleId: article.id } }), 0);
  } finally {
    await prisma.article.deleteMany({ where: { id: article.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
