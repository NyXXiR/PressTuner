import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { updateResumeQuestion } from "./resumeService";

test("question experience selection requires owner-confirmed memory with trusted facts", async () => {
  const suffix = randomUUID();
  const [owner, other] = await Promise.all([
    prisma.user.create({
      data: { loginId: `selection-owner-${suffix}`, label: "Owner" },
    }),
    prisma.user.create({
      data: { loginId: `selection-other-${suffix}`, label: "Other" },
    }),
  ]);
  try {
    const application = await prisma.application.create({
      data: {
        userId: owner.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: { create: { questionText: "Question" } },
      },
      include: { questions: true },
    });
    const [unsupported, trusted, foreign] = await Promise.all([
      prisma.experienceBrick.create({
        data: {
          userId: owner.id,
          title: "Unsupported",
          content: "No trusted facts",
          originalText: "No trusted facts",
          memoryStatus: "CONFIRMED",
        },
      }),
      prisma.experienceBrick.create({
        data: {
          userId: owner.id,
          title: "Trusted",
          content: "Trusted action",
          originalText: "Trusted action",
          memoryStatus: "CONFIRMED",
        },
      }),
      prisma.experienceBrick.create({
        data: {
          userId: other.id,
          title: "Foreign",
          content: "Foreign action",
          originalText: "Foreign action",
          memoryStatus: "CONFIRMED",
        },
      }),
    ]);
    await prisma.careerFact.create({
      data: {
        userId: owner.id,
        experienceId: trusted.id,
        kind: "ACTION",
        fieldPath: "actions[0]",
        value: "Trusted action",
        normalizedValue: "trusted action",
        trustStatus: "TRUSTED",
      },
    });
    for (const invalidId of [unsupported.id, foreign.id]) {
      await assert.rejects(
        updateResumeQuestion({
          userId: owner.id,
          questionId: application.questions[0]!.id,
          relatedBricks: [{ id: invalidId }],
        }),
        (error: unknown) => (error as { code?: string }).code === "FORBIDDEN",
      );
    }
    const result = await updateResumeQuestion({
      userId: owner.id,
      questionId: application.questions[0]!.id,
      relatedBricks: [{ id: trusted.id }],
    });
    assert.deepEqual(result.selectedExperiences, [
      {
        experienceId: trusted.id,
        isAiSuggested: false,
        isSelected: true,
        isUserSelected: true,
      },
    ]);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

test("manual answer edits increment revision and remove stale grounding and verification", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `answer-invalidation-${suffix}`, label: "Invalidation" },
  });
  try {
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: {
            questionText: "Question",
            answer: "Old answer",
            answerRevision: 3,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    await prisma.careerAnswerGrounding.create({
      data: {
        questionId: question.id,
        userId: user.id,
        operation: "GENERATE",
        answerHash: "old",
        answerRevision: 3,
        queryHash: "query",
        modelVersion: "model",
        retrievalVersion: "retrieval",
        memoryVersion: 0,
      },
    });
    await prisma.careerAnswerVerification.create({
      data: {
        questionId: question.id,
        userId: user.id,
        answerHash: "old",
        answerRevision: 3,
        careerMemoryVersion: 0,
        verifierVersion: "verifier",
        modelVersion: "model",
        result: "PASS",
      },
    });
    const result = await updateResumeQuestion({
      userId: user.id,
      questionId: question.id,
      answer: "New answer",
    });
    assert.equal(result.answerRevision, 4);
    assert.equal(
      await prisma.careerAnswerGrounding.count({
        where: { questionId: question.id },
      }),
      0,
    );
    assert.equal(
      await prisma.careerAnswerVerification.count({
        where: { questionId: question.id },
      }),
      0,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
