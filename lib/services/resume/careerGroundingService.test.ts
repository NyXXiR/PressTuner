import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  getCareerGrounding,
  persistCareerGrounding,
} from "./careerGroundingService";

test("grounding presents readable experience, fact, document, page, and durable excerpt details", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `career-grounding-${suffix}`,
      label: "Career grounding",
      email: `career-grounding-${suffix}@example.com`,
    },
  });
  try {
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: {
            questionText: "Describe impact",
            answer: "Improved conversion by 12%.",
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    const source = await prisma.careerSource.create({
      data: {
        userId: user.id,
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        checksum: randomUUID().replaceAll("-", ""),
        byteSize: 3,
        sourceData: Buffer.from("pdf"),
        status: "READY",
        chunks: {
          create: {
            userId: user.id,
            ordinal: 0,
            content: "Improved conversion by 12%.",
            contentHash: "content-hash",
            pageStart: 2,
            pageEnd: 2,
          },
        },
      },
      include: { chunks: true },
    });
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Growth launch",
        content: "Improved conversion",
        organization: "Apollo",
        roleTitle: "Growth lead",
        metrics: ["12%"],
        tags: [],
        memoryStatus: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByUserId: user.id,
      },
    });
    const fact = await prisma.careerFact.create({
      data: {
        userId: user.id,
        experienceId: experience.id,
        kind: "METRIC",
        fieldPath: "metrics[0]",
        value: "12%",
        normalizedValue: "12%",
        active: true,
        trustStatus: "TRUSTED",
        evidence: {
          create: {
            sourceChunkId: source.chunks[0]!.id,
            fieldPath: "metrics[0]",
            origin: "SOURCE_EXCERPT",
            excerpt: "Improved conversion by 12%.",
            pageStart: 2,
            pageEnd: 2,
          },
        },
      },
    });
    await persistCareerGrounding({
      questionId: question.id,
      userId: user.id,
      operation: "GENERATE",
      answer: question.answer!,
      query: "conversion",
      modelVersion: "test-model",
      retrievalVersion: "test-retrieval",
      usedExperienceIds: [experience.id],
      usedFactIds: [fact.id],
      preferredExperienceIds: [],
      retrievedExperienceIds: [experience.id],
      retrievedFactIds: [fact.id],
      memoryVersion: 7,
    });

    const presented = await getCareerGrounding({
      questionId: question.id,
      userId: user.id,
    });
    assert.deepEqual(presented?.experiences, [
      {
        experienceId: experience.id,
        title: "Growth launch",
        organization: "Apollo",
        roleTitle: "Growth lead",
      },
    ]);
    assert.deepEqual(presented?.preferredExperienceIds, []);
    assert.deepEqual(presented?.retrievedExperienceIds, [experience.id]);
    assert.deepEqual(presented?.usedExperienceIds, [experience.id]);
    assert.deepEqual(presented?.usedFactIds, [fact.id]);
    assert.equal(presented?.fallbackUsed, true);
    assert.equal(presented?.memoryVersion, 7);
    assert.equal(presented?.retrievalVersion, "test-retrieval");
    assert.equal(presented?.facts[0]?.kind, "METRIC");
    assert.equal(presented?.facts[0]?.value, "12%");
    assert.deepEqual(presented?.facts[0]?.evidence, [
      {
        documentName: "resume.pdf",
        excerpt: "Improved conversion by 12%.",
        pageStart: 2,
        pageEnd: 2,
      },
    ]);

    await prisma.careerSource.delete({ where: { id: source.id } });
    const afterDeletion = await getCareerGrounding({
      questionId: question.id,
      userId: user.id,
    });
    assert.deepEqual(afterDeletion?.facts[0]?.evidence, [
      {
        documentName: "삭제된 원본",
        excerpt: "Improved conversion by 12%.",
        pageStart: 2,
        pageEnd: 2,
      },
    ]);
  } finally {
    await prisma.careerAnswerGrounding.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
