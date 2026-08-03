import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import { prisma } from "@/lib/prisma";
import { finalizeCareerAnswer } from "./careerFinalizationService";

test("verified completion remains authoritative when final capture extraction is deferred", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `career-finalization-${suffix}`,
      label: "Career finalization",
      email: `career-finalization-${suffix}@example.com`,
    },
  });
  try {
    const answer = "A verified final answer";
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: {
            questionText: "Final answer",
            answer,
            answerRevision: 2,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    await prisma.careerAnswerVerification.create({
      data: {
        questionId: question.id,
        userId: user.id,
        answerHash: hashCareerAnswer(answer),
        answerRevision: 2,
        careerMemoryVersion: 0,
        verifierVersion: "test",
        modelVersion: "test",
        result: "PASS",
      },
    });

    const result = await finalizeCareerAnswer(
      { questionId: question.id, userId: user.id, answer },
      {
        capture: async () => {
          throw new Error("TRANSIENT_EXTRACTION_FAILURE");
        },
      },
    );
    assert.equal(result.completed, true);
    assert.equal(result.capture.kind, "deferred");
    assert.equal(result.capture.reason, "EXTRACTION_UNAVAILABLE");
    assert.equal(result.capture.status, "retrying");
    assert.equal(result.capture.attemptCount, 1);
    assert.ok(result.capture.taskId);
    assert.ok(result.capture.nextRetryAt);
    assert.equal(
      (await prisma.question.findUniqueOrThrow({ where: { id: question.id } }))
        .isCompleted,
      true,
    );
    const task = await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
      where: { id: result.capture.taskId },
    });
    assert.equal(task.status, "PENDING");
    assert.equal(task.questionId, question.id);
    assert.equal(task.userId, user.id);
    assert.equal(task.answerHash, hashCareerAnswer(answer));
    assert.equal(task.answerRevision, 2);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
