import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  deleteResumeDocumentImport,
  getResumeDocumentImport,
  listResumeDocumentImports,
} from "./resumeDocumentImportService";

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

    assert.equal((await listResumeDocumentImports(user.id)).length, 2);
    await deleteResumeDocumentImport({ importId: first.id, userId: user.id });

    const deletedSource = await prisma.careerSource.findUniqueOrThrow({ where: { id: source.id } });
    assert.equal(deletedSource.sourceData, null);
    assert.ok(deletedSource.deletedAt);
    assert.equal(await prisma.careerSourceChunk.count({ where: { sourceId: source.id } }), 0);
    assert.equal((await listResumeDocumentImports(user.id)).length, 0);
    await assert.rejects(
      getResumeDocumentImport({ importId: second.id, userId: user.id }),
      (error: unknown) => (error as { status?: number }).status === 404,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
