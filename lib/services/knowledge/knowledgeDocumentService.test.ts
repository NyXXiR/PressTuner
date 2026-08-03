import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  KnowledgeServiceError,
  listKnowledgeDocuments,
  replaceKnowledgeDocument,
  retryKnowledgeDocument,
} from "./knowledgeDocumentService";

function pdf(name: string, body: string) {
  return new File([`%PDF-1.7\n${body}`], name, {
    type: "application/pdf",
  });
}

async function fixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `knowledge-${suffix}`,
      label: `Knowledge ${suffix.slice(0, 8)}`,
      email: `knowledge-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `knowledge-${suffix}`,
      name: `Knowledge ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  return { user, team };
}

async function cleanup(args: { teamId: string; userId: string }) {
  await prisma.agentRetrievedSource.deleteMany({
    where: { run: { teamId: args.teamId } },
  });
  await prisma.team.deleteMany({ where: { id: args.teamId } });
  await prisma.user.deleteMany({ where: { id: args.userId } });
}

async function withQueuedScheduler<T>(fn: () => Promise<T>) {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    return await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

test("replacement preserves the READY predecessor until successor READY", async () => {
  const { user, team } = await fixture();
  try {
    await withQueuedScheduler(async () => {
      const created = await createKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        file: pdf("old.pdf", "old fact"),
      });
      await prisma.knowledgeDocument.update({
        where: { id: created.document.id },
        data: { status: "READY" },
      });

      const replacement = await replaceKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        documentId: created.document.id,
        file: pdf("new.pdf", "new fact"),
      });
      const beforeReady = await listKnowledgeDocuments(team.id);
      assert.equal(beforeReady.documents.length, 2);
      assert.equal(
        beforeReady.documents.find(({ id }) => id === created.document.id)
          ?.hasPendingReplacement,
        true,
      );
      await assert.rejects(
        deleteKnowledgeDocument({
          teamId: team.id,
          documentId: created.document.id,
        }),
        (error: unknown) =>
          error instanceof KnowledgeServiceError &&
          error.code === "KNOWLEDGE_REPLACEMENT_IN_PROGRESS",
      );

      await prisma.knowledgeDocument.update({
        where: { id: replacement.document.id },
        data: { status: "READY" },
      });
      const afterReady = await listKnowledgeDocuments(team.id);
      assert.deepEqual(
        afterReady.documents.map(({ id }) => id),
        [replacement.document.id],
      );
      assert.equal(
        await prisma.knowledgeDocument.findUnique({
          where: { id: created.document.id },
        }),
        null,
      );
    });
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("deleting cited knowledge archives bytes and keeps citation evidence", async () => {
  const { user, team } = await fixture();
  try {
    await withQueuedScheduler(async () => {
      const created = await createKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        file: pdf("evidence.pdf", "durable evidence"),
      });
      await prisma.knowledgeDocument.update({
        where: { id: created.document.id },
        data: { status: "READY" },
      });
      const chunk = await prisma.knowledgeChunk.create({
        data: {
          teamId: team.id,
          documentId: created.document.id,
          generationId: (
            await prisma.knowledgeIndexGeneration.create({
              data: {
                documentId: created.document.id,
                generation: 1,
                fingerprint: `fixture-${randomUUID()}`,
                parserVersion: "test-v1",
                chunkerVersion: "test-v1",
                embeddingModel: "test",
                embeddingDimensions: 1536,
                indexStatus: "READY",
                classificationStatus: "READY",
              },
            })
          ).id,
          ordinal: 0,
          content: "durable evidence",
          pageStart: 1,
          pageEnd: 1,
          contentHash: randomUUID(),
          parserVersion: "test-v1",
        },
      });
      const run = await prisma.agentRun.create({
        data: {
          teamId: team.id,
          startedById: user.id,
          status: "COMPLETED",
          agentVersion: "test-v1",
          model: "test",
          input: {},
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      await prisma.agentRetrievedSource.create({
        data: {
          runId: run.id,
          documentId: created.document.id,
          chunkId: chunk.id,
          sourceId: "source-1",
          documentName: "evidence.pdf",
          pageStart: 1,
          pageEnd: 1,
          excerpt: "durable evidence",
        },
      });

      const deleted = await deleteKnowledgeDocument({
        teamId: team.id,
        documentId: created.document.id,
      });
      assert.equal(deleted.disposition, "ARCHIVED");
      assert.ok(deleted.retainedBytes > 0);
      const archived = await prisma.knowledgeDocument.findUniqueOrThrow({
        where: { id: created.document.id },
        select: { deletedAt: true, sourceData: true },
      });
      assert.ok(archived.deletedAt);
      assert.ok(archived.sourceData);
      assert.equal((await listKnowledgeDocuments(team.id)).documents.length, 0);
      assert.equal(
        await prisma.agentRetrievedSource.count({
          where: { documentId: created.document.id },
        }),
        1,
      );
    });
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("a cited replacement successor can be replaced again after cutover", async () => {
  const { user, team } = await fixture();
  try {
    await withQueuedScheduler(async () => {
      const first = await createKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        file: pdf("first.pdf", "first"),
      });
      await prisma.knowledgeDocument.update({
        where: { id: first.document.id },
        data: { status: "READY" },
      });
      const chunk = await prisma.knowledgeChunk.create({
        data: {
          teamId: team.id,
          documentId: first.document.id,
          generationId: (
            await prisma.knowledgeIndexGeneration.create({
              data: {
                documentId: first.document.id,
                generation: 1,
                fingerprint: `fixture-${randomUUID()}`,
                parserVersion: "test-v1",
                chunkerVersion: "test-v1",
                embeddingModel: "test",
                embeddingDimensions: 1536,
                indexStatus: "READY",
                classificationStatus: "READY",
              },
            })
          ).id,
          ordinal: 0,
          content: "first evidence",
          pageStart: 1,
          pageEnd: 1,
          contentHash: randomUUID(),
          parserVersion: "test-v1",
        },
      });
      const run = await prisma.agentRun.create({
        data: {
          teamId: team.id,
          startedById: user.id,
          status: "COMPLETED",
          agentVersion: "test-v1",
          model: "test",
          input: {},
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      await prisma.agentRetrievedSource.create({
        data: {
          runId: run.id,
          documentId: first.document.id,
          chunkId: chunk.id,
          sourceId: "source-1",
          documentName: "first.pdf",
          pageStart: 1,
          pageEnd: 1,
          excerpt: "first evidence",
        },
      });
      const second = await replaceKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        documentId: first.document.id,
        file: pdf("second.pdf", "second"),
      });
      await prisma.knowledgeDocument.update({
        where: { id: second.document.id },
        data: { status: "READY" },
      });
      await listKnowledgeDocuments(team.id);

      const third = await replaceKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        documentId: second.document.id,
        file: pdf("third.pdf", "third"),
      });
      assert.equal(third.replacedDocumentId, second.document.id);
      assert.equal(third.document.replacesDocumentId, second.document.id);
    });
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("a queue timeout keeps one UPLOADED row recoverable without another upload event", async () => {
  const { user, team } = await fixture();
  const originalFetch = global.fetch;
  try {
    const first = await withQueuedScheduler(() =>
      createKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        file: pdf("queue-old.pdf", "old"),
      }),
    );
    await prisma.knowledgeDocument.update({
      where: { id: first.document.id },
      data: { status: "READY" },
    });
    global.fetch = (async () => {
      throw new Error("scheduler timeout");
    }) as typeof fetch;
    await assert.rejects(
      replaceKnowledgeDocument({
        teamId: team.id,
        userId: user.id,
        documentId: first.document.id,
        file: pdf("queue-new.pdf", "new"),
      }),
      (error: unknown) =>
        error instanceof KnowledgeServiceError &&
        error.code === "KNOWLEDGE_INDEX_QUEUE_FAILED",
    );
    const saved = await prisma.knowledgeDocument.findFirstOrThrow({
      where: { teamId: team.id, replacesDocumentId: first.document.id },
    });
    assert.equal(saved.status, "UPLOADED");
    assert.equal(
      await prisma.knowledgeUploadEvent.count({ where: { teamId: team.id } }),
      2,
    );

    global.fetch = (async () =>
      new Response(null, { status: 202 })) as typeof fetch;
    await retryKnowledgeDocument({
      teamId: team.id,
      documentId: saved.id,
    });
    assert.equal(
      await prisma.knowledgeUploadEvent.count({ where: { teamId: team.id } }),
      2,
    );
    const predecessor = await prisma.knowledgeDocument.findUniqueOrThrow({
      where: { id: first.document.id },
    });
    assert.equal(predecessor.status, "READY");
    assert.equal(predecessor.deletedAt, null);
  } finally {
    global.fetch = originalFetch;
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("concurrent final-slot uploads cannot exceed the team document limit", async () => {
  const { user, team } = await fixture();
  try {
    await prisma.knowledgeDocument.createMany({
      data: Array.from({ length: 24 }, (_, index) => ({
        teamId: team.id,
        uploadedById: user.id,
        originalName: `seed-${index}.pdf`,
        mimeType: "application/pdf",
        byteSize: 8,
        storageKey: `db://${team.id}/seed-${index}`,
        checksum: `seed-${index}`,
        sourceData: Buffer.from("%PDF-x"),
      })),
    });
    await withQueuedScheduler(async () => {
      const results = await Promise.allSettled([
        createKnowledgeDocument({
          teamId: team.id,
          userId: user.id,
          file: pdf("final-a.pdf", "A"),
        }),
        createKnowledgeDocument({
          teamId: team.id,
          userId: user.id,
          file: pdf("final-b.pdf", "B"),
        }),
      ]);
      assert.equal(
        results.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      const rejected = results.find(({ status }) => status === "rejected");
      assert.ok(
        rejected?.status === "rejected" &&
          rejected.reason instanceof KnowledgeServiceError &&
          rejected.reason.code === "KNOWLEDGE_DOCUMENT_LIMIT_EXCEEDED",
      );
      assert.equal(
        await prisma.knowledgeDocument.count({
          where: { teamId: team.id, deletedAt: null },
        }),
        25,
      );
    });
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("stored-byte and durable upload-rate limits return stable errors", async () => {
  const storageFixture = await fixture();
  const rateFixture = await fixture();
  try {
    await prisma.knowledgeDocument.create({
      data: {
        teamId: storageFixture.team.id,
        uploadedById: storageFixture.user.id,
        originalName: "storage.pdf",
        mimeType: "application/pdf",
        byteSize: 250 * 1024 * 1024,
        storageKey: `db://${storageFixture.team.id}/storage-limit`,
        checksum: "storage-limit",
        sourceData: Buffer.from("%PDF-x"),
      },
    });
    await assert.rejects(
      createKnowledgeDocument({
        teamId: storageFixture.team.id,
        userId: storageFixture.user.id,
        file: pdf("over-storage.pdf", "over"),
      }),
      (error: unknown) =>
        error instanceof KnowledgeServiceError &&
        error.code === "KNOWLEDGE_STORAGE_LIMIT_EXCEEDED" &&
        error.status === 413,
    );

    await prisma.knowledgeUploadEvent.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        teamId: rateFixture.team.id,
        userId: rateFixture.user.id,
        kind: "UPLOAD" as const,
        byteSize: index + 1,
      })),
    });
    await assert.rejects(
      createKnowledgeDocument({
        teamId: rateFixture.team.id,
        userId: rateFixture.user.id,
        file: pdf("over-rate.pdf", "over"),
      }),
      (error: unknown) =>
        error instanceof KnowledgeServiceError &&
        error.code === "KNOWLEDGE_UPLOAD_RATE_LIMITED" &&
        error.status === 429 &&
        Number(error.details?.retryAfterSeconds) > 0,
    );
  } finally {
    await cleanup({
      teamId: storageFixture.team.id,
      userId: storageFixture.user.id,
    });
    await cleanup({
      teamId: rateFixture.team.id,
      userId: rateFixture.user.id,
    });
  }
});
