import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { AI_MODELS } from "@/lib/constants/ai";
import { prisma } from "@/lib/prisma";
import { retrieveCareerMemory } from "./careerRetrievalService";

async function createUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `career-retrieval-${label}-${suffix}`,
      label: `Career retrieval ${label}`,
      email: `career-retrieval-${label}-${suffix}@example.com`,
    },
  });
}

async function createConfirmedExperience(input: {
  userId: string;
  title: string;
  content: string;
  factValue: string;
  embeddingRevision?: number;
  embeddedRevision?: number | null;
}) {
  return prisma.experienceBrick.create({
    data: {
      userId: input.userId,
      title: input.title,
      content: input.content,
      tags: [],
      memoryStatus: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedByUserId: input.userId,
      embeddingRevision: input.embeddingRevision ?? 0,
      embeddedRevision: input.embeddedRevision ?? null,
      careerFacts: {
        create: {
          userId: input.userId,
          kind: "SUMMARY",
          fieldPath: "summary",
          value: input.factValue,
          normalizedValue: input.factValue.toLocaleLowerCase("en-US"),
          active: true,
          trustStatus: "TRUSTED",
        },
      },
    },
    include: { careerFacts: true },
  });
}

test("career retrieval keeps owner text fallback while rejecting stale vectors and untrusted rows", async () => {
  const [owner, other] = await Promise.all([
    createUser("owner"),
    createUser("other"),
  ]);
  try {
    const application = await prisma.application.create({
      data: {
        userId: owner.id,
        companyName: "Apollo",
        jobTitle: "Platform engineer",
        questions: {
          create: { questionText: "Describe the Apollo migration" },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;

    const fallback = await createConfirmedExperience({
      userId: owner.id,
      title: "Apollo migration",
      content: "Migrated the Apollo platform",
      factValue: "Apollo migration",
    });
    const stale = await createConfirmedExperience({
      userId: owner.id,
      title: "Unrelated stale vector",
      content: "No lexical overlap",
      factValue: "No lexical overlap",
      embeddingRevision: 2,
      embeddedRevision: 1,
    });
    const current = await createConfirmedExperience({
      userId: owner.id,
      title: "Unrelated current vector",
      content: "Still no lexical overlap",
      factValue: "Still no lexical overlap",
      embeddingRevision: 3,
      embeddedRevision: 3,
    });
    const inactive = await createConfirmedExperience({
      userId: owner.id,
      title: "Apollo inactive",
      content: "Apollo inactive content",
      factValue: "Apollo inactive",
    });
    await prisma.careerFact.update({
      where: { id: inactive.careerFacts[0]!.id },
      data: { active: false },
    });
    const needsReview = await createConfirmedExperience({
      userId: owner.id,
      title: "Apollo needs review",
      content: "Apollo needs review content",
      factValue: "Apollo needs review",
    });
    await prisma.careerFact.update({
      where: { id: needsReview.careerFacts[0]!.id },
      data: { trustStatus: "NEEDS_REVIEW" },
    });
    const foreign = await createConfirmedExperience({
      userId: other.id,
      title: "Apollo foreign",
      content: "Apollo must remain private",
      factValue: "Apollo foreign",
    });

    const vectorIds = [stale.id, current.id];
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "experience_brick"
      SET "embedding" = array_fill(0.0, ARRAY[1536])::vector,
          "embedding_content_hash" = 'test-hash',
          "embedding_model" = ${AI_MODELS.EMBEDDING}
      WHERE "id" IN (${Prisma.join(vectorIds)})
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "career_fact"
      SET "embedding" = array_fill(0.0, ARRAY[1536])::vector,
          "embedding_content_hash" = 'test-hash',
          "embedding_model" = ${AI_MODELS.EMBEDDING}
      WHERE "experience_id" IN (${Prisma.join(vectorIds)})
    `);

    const result = await retrieveCareerMemory(
      {
        questionId: question.id,
        userId: owner.id,
        topK: 20,
      },
      {
        getEmbedding: async () => Array.from({ length: 1536 }, () => 0),
      },
    );
    const experienceIds = new Set(result.experiences.map((item) => item.id));
    const factIds = new Set(result.facts.map((item) => item.id));

    assert.equal(experienceIds.has(fallback.id), true);
    assert.equal(experienceIds.has(current.id), true);
    assert.equal(experienceIds.has(stale.id), false);
    assert.equal(experienceIds.has(inactive.id), false);
    assert.equal(experienceIds.has(needsReview.id), false);
    assert.equal(experienceIds.has(foreign.id), false);
    assert.equal(factIds.has(fallback.careerFacts[0]!.id), true);
    assert.equal(factIds.has(current.careerFacts[0]!.id), true);
    assert.equal(factIds.has(stale.careerFacts[0]!.id), false);
    assert.equal(factIds.has(inactive.careerFacts[0]!.id), false);
    assert.equal(factIds.has(needsReview.careerFacts[0]!.id), false);
    assert.equal(factIds.has(foreign.careerFacts[0]!.id), false);
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  }
});
