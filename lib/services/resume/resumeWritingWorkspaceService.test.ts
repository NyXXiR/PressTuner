import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BrickSource, QuestionAiMessageKind, QuestionAiMessageRole } from "@prisma/client";

import { ApplicationIdSchema } from "@/domain/resume-writing/schemas";
import { prisma } from "@/lib/prisma";
import { getResumeWritingWorkspace } from "./resumeWritingWorkspaceService";

test("getResumeWritingWorkspace returns durable pending captures and productivity", async () => {
  // Given
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `resume-workspace-${suffix}`,
      label: `Resume Workspace ${suffix.slice(0, 8)}`,
      email: `resume-workspace-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `resume-workspace-${suffix}`,
      name: `Resume Workspace ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });

  try {
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        teamId: team.id,
        companyName: "PressTuner",
        jobTitle: "Product Engineer",
        questions: {
          create: {
            questionText: "문제를 해결한 경험을 작성해 주세요.",
            answer: "고객 이탈 원인을 분석해 전환율을 개선했습니다.",
            isCompleted: true,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0];
    assert.ok(question);

    const brick = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        teamId: team.id,
        title: "전환율 개선 실험",
        content: "고객 이탈 원인을 분석해 전환율을 개선했다.",
        originalText: "고객 이탈 원인을 분석해 전환율을 개선했습니다.",
        tags: ["전환율"],
        source: BrickSource.AI_EXTRACT,
      },
    });
    await prisma.questionOnBrick.create({
      data: {
        questionId: question.id,
        brickId: brick.id,
        isSelected: true,
      },
    });
    await prisma.questionAiMessage.create({
      data: {
        questionId: question.id,
        role: QuestionAiMessageRole.ASSISTANT,
        kind: QuestionAiMessageKind.SUGGESTION,
        content: "새 경험 1개를 찾았습니다.",
        meta: {
          type: "resume_writing_experience_capture_v1",
          schemaVersion: 1,
          applicationId: application.id,
          questionId: question.id,
          summary: "새 경험 1개를 찾았습니다.",
          items: [
            {
              previewId: "preview-1",
              mode: "create",
              title: "전환율 개선 실험",
              content: "고객 이탈 원인을 분석해 전환율을 개선했다.",
              originalText: "고객 이탈 원인을 분석해 전환율을 개선했습니다.",
              period: null,
              tags: ["전환율"],
              matchedBrickId: null,
              matchedBrickTitle: null,
              reason: "새 성과 경험",
              existingContent: null,
              existingOriginalText: null,
            },
          ],
        },
      },
    });

    // When
    const workspace = await getResumeWritingWorkspace({
      applicationId: ApplicationIdSchema.parse(application.id),
      userId: user.id,
      teamId: team.id,
    });

    // Then
    assert.equal(workspace.stage, "MEMORY_REVIEW");
    assert.equal(workspace.pendingCaptureCount, 1);
    assert.equal(workspace.pendingCaptures.length, 1);
    assert.deepEqual(workspace.productivity, {
      availableBrickCount: 1,
      capturedFromWritingCount: 1,
      reusedBrickCount: 1,
    });
    assert.deepEqual(workspace.nextAction, {
      type: "review_experience_captures",
    });
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
