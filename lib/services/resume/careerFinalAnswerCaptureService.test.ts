import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { prisma } from "@/lib/prisma";
import {
  ApplicationIdSchema,
  CaptureIdSchema,
} from "@/domain/resume-writing/schemas";
import {
  buildFinalAnswerCaptureResponseFormat,
  captureFinalAnswerProposals,
} from "./careerFinalAnswerCaptureService";
import { resolveResumeWritingCapture } from "./resumeWritingCaptureService";
import { updateApplicationStatus } from "./resumeApplicationService";

after(async () => {
  await prisma.$disconnect();
});

test("final-answer capture uses a strict structured response contract", () => {
  const responseFormat = buildFinalAnswerCaptureResponseFormat();

  assert.equal(responseFormat.type, "json_schema");
  assert.equal(responseFormat.json_schema.strict, true);
  assert.deepEqual(
    (
      responseFormat.json_schema.schema.properties.items as {
        items: { properties: { mode: { enum: string[] } } };
      }
    ).items.properties.mode.enum,
    ["CREATE", "AUGMENT", "LINK"],
  );
});

test("final-answer capture persists one grouped proposal and requires explicit item approval", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `final-capture-${suffix}`,
      label: "Final capture",
      email: `final-capture-${suffix}@example.com`,
    },
  });
  try {
    const answer = "At Apollo I launched A. At Borealis I launched B.";
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: {
            questionText: "Describe launches",
            answer,
            answerRevision: 4,
            isCompleted: true,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    const extract = async () => ({
      summary: "Two review items",
      items: [
        {
          mode: "CREATE" as const,
          title: "Apollo launch",
          content: "Launched A",
          evidence: [
            { fieldPath: "summary", excerpt: "At Apollo I launched A." },
          ],
        },
        {
          mode: "CREATE" as const,
          title: "Borealis launch",
          content: "Launched B",
          evidence: [
            { fieldPath: "summary", excerpt: "At Borealis I launched B." },
          ],
        },
      ],
    });
    const [first, repeated] = await Promise.all([
      captureFinalAnswerProposals(
        {
          questionId: question.id,
          userId: user.id,
          answer,
          answerRevision: 4,
        },
        { extract },
      ),
      captureFinalAnswerProposals(
        {
          questionId: question.id,
          userId: user.id,
          answer,
          answerRevision: 4,
        },
        { extract },
      ),
    ]);

    assert.equal(first.id, repeated.id);
    assert.equal(first.candidates.length, 2);
    assert.equal(repeated.candidates.length, 2);
    assert.equal(
      await prisma.experienceBrick.count({ where: { userId: user.id } }),
      0,
    );
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
    const selectedId = first.candidates[0]!.id;
    const resolution = await resolveResumeWritingCapture({
      applicationId: ApplicationIdSchema.parse(application.id),
      captureId: CaptureIdSchema.parse(first.id),
      userId: user.id,
      teamId: "unused-team",
      action: { action: "apply", selectedPreviewIds: [selectedId] },
    });
    assert.equal(resolution.status, "applied");
    assert.equal(resolution.appliedCount, 1);
    const decisions = await prisma.careerExperienceCandidate.findMany({
      where: { captureProposalId: first.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(decisions.length, 2);
    assert.equal(
      decisions.find((candidate) => candidate.id === selectedId)?.status,
      "APPROVED",
    );
    assert.equal(
      decisions.find((candidate) => candidate.id !== selectedId)?.status,
      "REJECTED",
    );
    assert.equal(
      await prisma.experienceBrick.count({ where: { userId: user.id } }),
      1,
    );
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
    const duplicateResolution = await resolveResumeWritingCapture({
      applicationId: ApplicationIdSchema.parse(application.id),
      captureId: CaptureIdSchema.parse(first.id),
      userId: user.id,
      teamId: "unused-team",
      action: { action: "apply", selectedPreviewIds: [selectedId] },
    });
    assert.equal(duplicateResolution.status, "already_resolved");
    assert.equal(
      await prisma.experienceBrick.count({ where: { userId: user.id } }),
      1,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
