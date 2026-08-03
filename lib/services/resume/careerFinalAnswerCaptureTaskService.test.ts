import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import { prisma } from "@/lib/prisma";
import {
  createAndAttemptCareerFinalAnswerCaptureTask,
  processDueCareerFinalAnswerCaptureTasks,
  skipCareerFinalAnswerCaptureTask,
} from "./careerFinalAnswerCaptureTaskService";

async function fixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `capture-task-${suffix}`, label: "Capture task" },
  });
  const application = await prisma.application.create({
    data: {
      userId: user.id,
      companyName: "Target",
      jobTitle: "Engineer",
      questions: {
        create: {
          questionText: "Question",
          answer: "Current completed answer",
          answerRevision: 1,
          isCompleted: true,
        },
      },
    },
    include: { questions: true },
  });
  return { user, application, question: application.questions[0]! };
}

test("duplicate completion leaves one durable task and extraction claim", async () => {
  const { user, question } = await fixture();
  try {
    const capture = async () => {
      throw new Error("provider payload must not be persisted");
    };
    const input = {
      questionId: question.id,
      userId: user.id,
      answer: question.answer!,
      answerRevision: question.answerRevision,
    };
    const [first, second] = await Promise.all([
      createAndAttemptCareerFinalAnswerCaptureTask(input, { capture }),
      createAndAttemptCareerFinalAnswerCaptureTask(input, { capture }),
    ]);
    assert.equal(first.task.id, second.task.id);
    const tasks = await prisma.careerFinalAnswerCaptureTask.findMany({
      where: { userId: user.id, questionId: question.id },
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.attemptCount, 1);
    assert.equal(tasks[0]?.lastErrorCode, "EXTRACTION_UNAVAILABLE");
    assert.doesNotMatch(tasks[0]?.lastErrorMessage ?? "", /provider payload/);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("stale snapshots supersede without extraction", async () => {
  const { user, application, question } = await fixture();
  try {
    const task = await prisma.careerFinalAnswerCaptureTask.create({
      data: {
        userId: user.id,
        applicationId: application.id,
        questionId: question.id,
        answerHash: hashCareerAnswer(question.answer!),
        answerRevision: question.answerRevision,
      },
    });
    await prisma.question.update({
      where: { id: question.id },
      data: { answer: "New answer", answerRevision: { increment: 1 } },
    });
    let called = false;
    const counts = await processDueCareerFinalAnswerCaptureTasks(
      { limit: 5 },
      {
        capture: async () => {
          called = true;
          throw new Error("should not run");
        },
      },
    );
    assert.equal(called, false);
    assert.equal(counts.superseded, 1);
    assert.equal(
      (await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
        where: { id: task.id },
      })).status,
      "SUPERSEDED",
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("third automatic failure becomes terminal FAILED", async () => {
  const { user, application, question } = await fixture();
  try {
    const task = await prisma.careerFinalAnswerCaptureTask.create({
      data: {
        userId: user.id,
        applicationId: application.id,
        questionId: question.id,
        answerHash: hashCareerAnswer(question.answer!),
        answerRevision: question.answerRevision,
        attemptCount: 2,
      },
    });
    const counts = await processDueCareerFinalAnswerCaptureTasks(
      { limit: 5 },
      { capture: async () => { throw new Error("failure"); } },
    );
    assert.equal(counts.failed, 1);
    const failed = await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
      where: { id: task.id },
    });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.attemptCount, 3);
    assert.equal(failed.nextAttemptAt, null);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("terminal extraction failure requires an explicit idempotent skip decision", async () => {
  const { user, application, question } = await fixture();
  try {
    const task = await prisma.careerFinalAnswerCaptureTask.create({
      data: {
        userId: user.id,
        applicationId: application.id,
        questionId: question.id,
        answerHash: hashCareerAnswer(question.answer!),
        answerRevision: question.answerRevision,
        status: "FAILED",
        attemptCount: 3,
      },
    });
    const first = await skipCareerFinalAnswerCaptureTask({
      taskId: task.id,
      applicationId: application.id,
      userId: user.id,
      reason: "No reusable experience in this answer",
    });
    const duplicate = await skipCareerFinalAnswerCaptureTask({
      taskId: task.id,
      applicationId: application.id,
      userId: user.id,
      reason: "No reusable experience in this answer",
    });
    assert.equal(first.task.status, "SKIPPED");
    assert.equal(first.idempotent, false);
    assert.equal(duplicate.idempotent, true);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
