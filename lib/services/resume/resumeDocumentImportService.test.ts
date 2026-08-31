import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  deleteResumeDocumentImport,
  getResumeDocumentImport,
  listResumeDocumentImports,
  retryResumeDocumentImport,
} from "./resumeDocumentImportService";
import { listResumeDocumentCandidates } from "./resumeDocumentCandidateService";

const schedulerUrlKeys = ["CAREER_SCHEDULER_URL", "SCHEDULER_INTERNAL_URL", "SCHEDULER_URL"] as const;

async function withoutSchedulerUrl<T>(operation: () => Promise<T>) {
  const previous = Object.fromEntries(schedulerUrlKeys.map((key) => [key, process.env[key]]));
  for (const key of schedulerUrlKeys) delete process.env[key];
  try {
    return await operation();
  } finally {
    for (const key of schedulerUrlKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("deleting an import purges its shared source bytes and chunks and hides every import for that source", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `resume-import-delete-${suffix}`,
      label: "Resume import delete",
      email: `resume-import-delete-${suffix}@example.com`,
    },
  });
  try {
    const source = await prisma.careerSource.create({
      data: {
        userId: user.id,
        originalName: "private-resume.txt",
        mimeType: "text/plain",
        checksum: randomUUID().replaceAll("-", ""),
        byteSize: 20,
        sourceData: Buffer.from("private resume text"),
        status: "READY",
        chunks: {
          create: {
            userId: user.id,
            ordinal: 0,
            content: "private resume text",
            contentHash: randomUUID(),
            pageStart: 1,
            pageEnd: 1,
          },
        },
      },
    });
    const [first, second] = await Promise.all([
      prisma.resumeDocumentImport.create({ data: { userId: user.id, sourceId: source.id, status: "COMPLETE" } }),
      prisma.resumeDocumentImport.create({ data: { userId: user.id, sourceId: source.id, status: "COMPLETE" } }),
    ]);
    const chunk = await prisma.careerSourceChunk.findFirstOrThrow({ where: { sourceId: source.id } });
    const candidate = await prisma.resumeDocumentCandidate.create({
      data: {
        importId: first.id,
        userId: user.id,
        kind: "IDENTITY_FIELD",
        recommendedSectionId: "profile",
        targetSectionId: "profile",
        targetSectionKind: "identity",
        applyMode: "REPLACE",
        payload: { type: "identity-field", field: "email", value: "private@example.com" },
        payloadHash: "private-payload-hash",
        evidence: {
          create: {
            sourceChunkId: chunk.id,
            fieldPath: "profile.email",
            excerpt: "private@example.com",
          },
        },
      },
    });

    assert.equal((await listResumeDocumentImports(user.id)).length, 2);
    await deleteResumeDocumentImport({ importId: first.id, userId: user.id });

    const deletedSource = await prisma.careerSource.findUniqueOrThrow({ where: { id: source.id } });
    assert.equal(deletedSource.sourceData, null);
    assert.ok(deletedSource.deletedAt);
    assert.equal(await prisma.careerSourceChunk.count({ where: { sourceId: source.id } }), 0);
    assert.equal(await prisma.resumeDocumentImport.count({ where: { sourceId: source.id } }), 0);
    assert.equal(await prisma.resumeDocumentCandidate.count({ where: { id: candidate.id } }), 0);
    assert.equal(await prisma.resumeDocumentCandidateEvidence.count({ where: { candidateId: candidate.id } }), 0);
    assert.deepEqual(await listResumeDocumentCandidates({ userId: user.id, importId: first.id }), []);
    assert.equal((await listResumeDocumentImports(user.id)).length, 0);
    await assert.rejects(
      getResumeDocumentImport({ importId: second.id, userId: user.id }),
      (error: unknown) => (error as { status?: number }).status === 404,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("concurrent retries share one successful scheduler enqueue", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `resume-import-concurrent-retry-${suffix}`,
      label: "Resume import concurrent retry",
      email: `resume-import-concurrent-retry-${suffix}@example.com`,
    },
  });
  try {
    const source = await prisma.careerSource.create({
      data: {
        userId: user.id,
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        checksum: randomUUID().replaceAll("-", ""),
        byteSize: 20,
        sourceData: Buffer.from("%PDF-private resume"),
        status: "READY",
      },
    });
    const importTask = await prisma.resumeDocumentImport.create({
      data: {
        userId: user.id,
        sourceId: source.id,
        status: "FAILED",
        errorCode: "EXTRACTION_FAILED",
        errorMessage: "failed",
        failedAt: new Date(),
      },
    });

    const previousUrl = process.env.CAREER_SCHEDULER_URL;
    const previousFetch = globalThis.fetch;
    let schedulerCalls = 0;
    let releaseScheduler!: () => void;
    const schedulerGate = new Promise<void>((resolve) => { releaseScheduler = resolve; });
    process.env.CAREER_SCHEDULER_URL = "http://scheduler.example";
    globalThis.fetch = async () => {
      schedulerCalls += 1;
      await schedulerGate;
      return new Response(null, { status: 202 });
    };
    let results: PromiseSettledResult<Awaited<ReturnType<typeof retryResumeDocumentImport>>>[] = [];
    try {
      const first = retryResumeDocumentImport({ importId: importTask.id, userId: user.id });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const status = await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id }, select: { status: true } });
        if (status.status === "QUEUED") break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.equal((await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id }, select: { status: true } })).status, "QUEUED");
      const second = retryResumeDocumentImport({ importId: importTask.id, userId: user.id });
      releaseScheduler();
      results = await Promise.allSettled([first, second]);
    } finally {
      releaseScheduler();
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.CAREER_SCHEDULER_URL;
      else process.env.CAREER_SCHEDULER_URL = previousUrl;
    }

    assert.ok(results.every((result) => result.status === "fulfilled"));
    assert.equal(schedulerCalls, 1);
    const queued = await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id } });
    assert.equal(queued.status, "QUEUED");
    assert.equal(queued.processingVersion, 1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("retrying a failed document import reports scheduler enqueue failure", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `resume-import-retry-${suffix}`,
      label: "Resume import retry",
      email: `resume-import-retry-${suffix}@example.com`,
    },
  });
  try {
    const source = await prisma.careerSource.create({
      data: {
        userId: user.id,
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        checksum: randomUUID().replaceAll("-", ""),
        byteSize: 20,
        sourceData: Buffer.from("%PDF-private resume"),
        status: "READY",
      },
    });
    const importTask = await prisma.resumeDocumentImport.create({
      data: {
        userId: user.id,
        sourceId: source.id,
        status: "FAILED",
        errorCode: "EXTRACTION_FAILED",
        errorMessage: "failed",
        failedAt: new Date(),
      },
    });

    await assert.rejects(
      withoutSchedulerUrl(() => retryResumeDocumentImport({ importId: importTask.id, userId: user.id })),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 503 && value.code === "RESUME_DOCUMENT_IMPORT_QUEUE_UNAVAILABLE";
      },
    );
    const failed = await prisma.resumeDocumentImport.findUniqueOrThrow({ where: { id: importTask.id } });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.errorCode, "RESUME_DOCUMENT_IMPORT_QUEUE_UNAVAILABLE");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
