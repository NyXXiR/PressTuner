import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  CAREER_SOURCE_MAX_BYTES,
  retryCareerSource,
  validateCareerPdf,
} from "./careerSourceService";

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

test("career PDF validation checks extension, MIME, signature, and 20 MB limit", () => {
  const valid = {
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7\ncontent"),
  };
  assert.doesNotThrow(() => validateCareerPdf(valid));
  assert.throws(
    () => validateCareerPdf({ ...valid, originalName: "resume.txt" }),
    /Only PDF/,
  );
  assert.throws(
    () => validateCareerPdf({ ...valid, mimeType: "application/octet-stream" }),
    /application\/pdf/,
  );
  assert.throws(
    () => validateCareerPdf({ ...valid, bytes: Buffer.from("not a pdf") }),
    /signature/,
  );
  assert.throws(
    () =>
      validateCareerPdf({
        ...valid,
        bytes: new Uint8Array(CAREER_SOURCE_MAX_BYTES + 1),
      }),
    /20 MB/,
  );
});

test("retrying a failed career source reports scheduler enqueue failure", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `career-source-retry-${suffix}`,
      label: "Career source retry",
      email: `career-source-retry-${suffix}@example.com`,
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
        status: "FAILED",
        errorCode: "PARSER_FAILED",
        errorMessage: "failed",
        failedAt: new Date(),
      },
    });

    await assert.rejects(
      withoutSchedulerUrl(() => retryCareerSource({ sourceId: source.id, userId: user.id })),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 503 && value.code === "CAREER_QUEUE_UNAVAILABLE";
      },
    );
    const failed = await prisma.careerSource.findUniqueOrThrow({ where: { id: source.id } });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.errorCode, "CAREER_QUEUE_UNAVAILABLE");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
