import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  ApplicationIdSchema,
  QuestionIdSchema,
} from "@/domain/resume-writing/schemas";
import { prisma } from "@/lib/prisma";
import { completeResumeWritingQuestionWithServices } from "./resumeWritingCompletionService";

test("question completion rejects a stale expected answer revision", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `completion-revision-${suffix}`, label: "Revision" },
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
            answer: "Current answer",
            answerRevision: 2,
          },
        },
      },
      include: { questions: true },
    });
    await assert.rejects(
      completeResumeWritingQuestionWithServices({
        applicationId: ApplicationIdSchema.parse(application.id),
        questionId: QuestionIdSchema.parse(application.questions[0]!.id),
        userId: user.id,
        teamId: "unused-team",
        answer: "Current answer",
        expectedAnswerRevision: 1,
      }),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "CAREER_ANSWER_REVISION_CONFLICT",
    );
    assert.equal(
      (
        await prisma.question.findUniqueOrThrow({
          where: { id: application.questions[0]!.id },
        })
      ).isCompleted,
      false,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
