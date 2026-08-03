import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import { skipCareerFinalAnswerCaptureTask } from "./careerFinalAnswerCaptureTaskService";
import {
  startResumeApplication,
  updateApplicationStatus,
} from "./resumeApplicationService";

const brief = {
  companyName: "Target",
  jobTitle: "Engineer",
  deadline: null,
  employmentType: null,
  location: null,
  summary: "Build reliable products",
  coreResponsibilities: ["Build APIs"],
  requirements: ["TypeScript"],
  preferredQualifications: [],
  keySignals: ["ownership"],
  writingGuidance: ["Use evidence"],
  questions: [{ questionText: "Describe your impact", charLimit: 800 }],
};

test("start command is readiness-gated without creating an application", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `application-not-ready-${suffix}`,
      label: "Application not ready",
      email: `application-not-ready-${suffix}@example.com`,
    },
  });
  const before = await prisma.application.count({ where: { userId: user.id } });
  try {
    await assert.rejects(
      startResumeApplication({
        userId: user.id,
        teamId: "unused-team",
        command: {
          clientRequestId: "request-1",
          brief,
          commonWritingGuidance: [],
        },
      }),
      (error: unknown) =>
        (error as { code?: string }).code === "CAREER_MEMORY_NOT_READY",
    );
    assert.equal(
      await prisma.application.count({ where: { userId: user.id } }),
      before,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("start command is user-idempotent and persists structured brief", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `application-idempotent-${suffix}`,
      label: "Application idempotent",
      email: `application-idempotent-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `application-idempotent-${suffix}`,
      name: "Application idempotent",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Reliable API",
        content: "Built a reliable API",
        originalText: "Built a reliable API",
        memoryStatus: "CONFIRMED",
      },
    });
    await prisma.careerFact.create({
      data: {
        userId: user.id,
        experienceId: experience.id,
        kind: "ACTION",
        fieldPath: "actions[0]",
        value: "Built a reliable API",
        normalizedValue: "built a reliable api",
        trustStatus: "TRUSTED",
      },
    });
    let strategyCalls = 0;
    const generateStrategy = async () => {
      strategyCalls += 1;
      return { items: [] };
    };
    const input = {
      userId: user.id,
      teamId: team.id,
      command: {
        clientRequestId: "request-1",
        brief,
        commonWritingGuidance: ["Lead with impact"],
      },
    };

    const first = await startResumeApplication(input, { generateStrategy });
    const duplicate = await startResumeApplication(input, { generateStrategy });

    assert.equal(first.applicationId, duplicate.applicationId);
    assert.equal(first.strategyStatus, "READY");
    assert.equal(strategyCalls, 1);
    const stored = await prisma.application.findUniqueOrThrow({
      where: { id: first.applicationId },
    });
    assert.deepEqual(stored.brief, brief);
    assert.deepEqual(stored.commonWritingGuidance, ["Lead with impact"]);
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("strategy failure returns the durable application id and retry state", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `application-strategy-failed-${suffix}`,
      label: "Application strategy failure",
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `application-strategy-failed-${suffix}`,
      name: "Strategy failure",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Owned migration",
        content: "Migrated a service",
        originalText: "Migrated a service",
        memoryStatus: "CONFIRMED",
      },
    });
    await prisma.careerFact.create({
      data: {
        userId: user.id,
        experienceId: experience.id,
        kind: "ACTION",
        fieldPath: "actions[0]",
        value: "Migrated a service",
        normalizedValue: "migrated a service",
        trustStatus: "TRUSTED",
      },
    });
    const result = await startResumeApplication(
      {
        userId: user.id,
        teamId: team.id,
        command: {
          clientRequestId: "failed-strategy",
          brief,
          commonWritingGuidance: [],
        },
      },
      {
        generateStrategy: async () => {
          throw new Error("provider unavailable");
        },
      },
    );
    assert.ok(result.applicationId);
    assert.equal(result.strategyStatus, "FAILED");
    assert.deepEqual(result.nextAction, { type: "retry_strategy" });
    assert.equal(
      (
        await prisma.application.findUniqueOrThrow({
          where: { id: result.applicationId },
        })
      ).strategyStatus,
      "FAILED",
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("application DONE requires every authoritative question completion", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `application-completion-${suffix}`,
      label: "Application completion",
      email: `application-completion-${suffix}@example.com`,
    },
  });
  try {
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: [
            { questionText: "One", answer: "Done", isCompleted: true },
            { questionText: "Two", answer: "Not finalized", isCompleted: false },
          ],
        },
      },
      include: { questions: true },
    });
    await assert.rejects(
      updateApplicationStatus({
        userId: user.id,
        teamId: "unused-team",
        applicationId: application.id,
        status: "DONE",
      }),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "APPLICATION_COMPLETION_NOT_READY",
    );
    assert.equal(
      (await prisma.application.findUniqueOrThrow({
        where: { id: application.id },
      })).status,
      "WRITING",
    );
    await prisma.question.updateMany({
      where: { applicationId: application.id },
      data: { isCompleted: true },
    });
    const completed = await updateApplicationStatus({
      userId: user.id,
      teamId: "unused-team",
      applicationId: application.id,
      status: "DONE",
    });
    assert.equal(completed.status, "DONE");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("failed capture work blocks DONE until an explicit skip decision", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `application-capture-${suffix}`, label: "Capture gate" },
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
            answer: "Completed answer",
            answerRevision: 1,
            isCompleted: true,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    const task = await prisma.careerFinalAnswerCaptureTask.create({
      data: {
        userId: user.id,
        applicationId: application.id,
        questionId: question.id,
        answerHash: hashCareerAnswer(question.answer!),
        answerRevision: question.answerRevision,
        status: "FAILED",
      },
    });
    await assert.rejects(
      updateApplicationStatus({
        userId: user.id,
        teamId: "unused-team",
        applicationId: application.id,
        status: "DONE",
      }),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "APPLICATION_COMPLETION_NOT_READY",
    );
    await skipCareerFinalAnswerCaptureTask({
      taskId: task.id,
      applicationId: application.id,
      userId: user.id,
      reason: "No memory should be extracted",
    });
    assert.equal(
      (
        await updateApplicationStatus({
          userId: user.id,
          teamId: "unused-team",
          applicationId: application.id,
          status: "DONE",
        })
      ).status,
      "DONE",
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
