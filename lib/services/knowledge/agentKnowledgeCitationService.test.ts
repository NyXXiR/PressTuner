import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { listKnowledgeDocuments } from "./knowledgeDocumentService";
import { persistPreparedAgentKnowledgeCitations } from "./agentKnowledgeCitationService";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("replacement cleanup waits for in-flight retrieval to persist its citation", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `citation-lock-${suffix}`,
      label: "Citation lock",
      email: `citation-lock-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `citation-lock-${suffix}`,
      name: "Citation lock",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  try {
    const predecessor = await prisma.knowledgeDocument.create({
      data: {
        teamId: team.id,
        uploadedById: user.id,
        originalName: "predecessor.pdf",
        mimeType: "application/pdf",
        byteSize: 8,
        storageKey: `db://${team.id}/predecessor`,
        checksum: `predecessor-${suffix}`,
        status: "READY",
        sourceData: Buffer.from("%PDF-x"),
      },
    });
    const generation = await prisma.knowledgeIndexGeneration.create({
      data: {
        documentId: predecessor.id,
        generation: 1,
        fingerprint: `fixture-${suffix}`,
        parserVersion: "test-v1",
        chunkerVersion: "test-v1",
        embeddingModel: "test",
        embeddingDimensions: 1536,
        indexStatus: "READY",
        classificationStatus: "READY",
      },
    });
    await prisma.knowledgeDocument.update({
      where: { id: predecessor.id },
      data: { activeGenerationId: generation.id },
    });
    const chunk = await prisma.knowledgeChunk.create({
      data: {
        teamId: team.id,
        documentId: predecessor.id,
        generationId: generation.id,
        ordinal: 0,
        content: "durable launch evidence for a verified press release answer",
        pageStart: 1,
        pageEnd: 1,
        contentHash: `chunk-${suffix}`,
        parserVersion: "test-v1",
        autoRole: "FACT",
      },
    });
    const successor = await prisma.knowledgeDocument.create({
      data: {
        teamId: team.id,
        uploadedById: user.id,
        originalName: "successor.pdf",
        mimeType: "application/pdf",
        byteSize: 8,
        storageKey: `db://${team.id}/successor`,
        checksum: `successor-${suffix}`,
        status: "INDEXING",
        sourceData: Buffer.from("%PDF-x"),
        replacesDocumentId: predecessor.id,
      },
    });
    const run = await prisma.agentRun.create({
      data: {
        teamId: team.id,
        startedById: user.id,
        status: "RUNNING",
        agentVersion: "test-v1",
        model: "test",
        input: {},
        startedAt: new Date(),
      },
    });
    const retrieved = deferred();
    const release = deferred();
    const citationPromise = persistPreparedAgentKnowledgeCitations(
      {
        teamId: team.id,
        runId: run.id,
        query: "durable",
        embedding: Array.from({ length: 1536 }, () => 0),
      },
      {
        afterRetrieval: async () => {
          retrieved.resolve();
          await release.promise;
        },
      },
    );

    await retrieved.promise;
    await prisma.knowledgeDocument.update({
      where: { id: successor.id },
      data: { status: "READY" },
    });
    const reconciliation = listKnowledgeDocuments(team.id);
    release.resolve();

    const [citationResult, listed] = await Promise.all([
      citationPromise,
      reconciliation,
    ]);
    assert.equal(citationResult.citations.length, 1);
    assert.equal(citationResult.citations[0]?.chunkId, chunk.id);
    assert.equal(citationResult.evidenceDecision.action, "ANSWER");
    assert.equal(citationResult.evidenceDecision.code, "EVIDENCE_SUFFICIENT");
    assert.deepEqual(citationResult.evidenceDecision.eligibleSourceIds, ["source-1"]);
    assert.equal(citationResult.queryPlan.originalQuery, "durable");
    assert.equal(citationResult.candidateTrace[0]?.selected, true);
    assert.deepEqual(listed.documents.map(({ id }) => id), [successor.id]);

    const archived = await prisma.knowledgeDocument.findUniqueOrThrow({
      where: { id: predecessor.id },
      select: { deletedAt: true, sourceData: true },
    });
    assert.ok(archived.deletedAt);
    assert.ok(archived.sourceData);
    assert.equal(
      await prisma.agentRetrievedSource.count({
        where: { documentId: predecessor.id },
      }),
      1,
    );
  } finally {
    await prisma.agentRetrievedSource.deleteMany({
      where: { run: { teamId: team.id } },
    });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("model reranking has an explicit transaction deadline above Prisma's five-second default", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./agentKnowledgeCitationService.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /AGENT_KNOWLEDGE_TRANSACTION_TIMEOUT_MS = 30_000/);
  assert.match(source, /timeout: AGENT_KNOWLEDGE_TRANSACTION_TIMEOUT_MS/);
});
