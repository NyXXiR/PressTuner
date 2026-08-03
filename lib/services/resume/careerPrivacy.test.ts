import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerExperienceStatus,
  CareerFactKind,
  CareerFactTrustStatus,
  CareerGroundingOperation,
  PlanCategory,
  PlanType,
  TeamRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createCareerCandidate,
  listCareerCandidates,
} from "./careerCandidateService";
import {
  getExperienceBricks,
  updateExperienceBrick,
} from "./resumeBrickService";
import { buildResumeAiContext } from "./resumeAiContextService";
import { persistCareerGrounding } from "./careerGroundingService";
import { updateResumeQuestion } from "./resumeService";

async function createTestUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `career-privacy-${label}-${suffix}`,
      label: `Career privacy ${label}`,
      email: `career-privacy-${label}-${suffix}@example.com`,
    },
  });
}

async function createContextApplication(userId: string, brickId: string) {
  const application = await prisma.application.create({
    data: {
      userId,
      companyName: "Context target",
      jobTitle: "Context role",
      questions: {
        create: {
          questionText: "Describe the selected experience",
          relatedBricks: { create: { brickId } },
        },
      },
    },
    include: { questions: true },
  });
  return { application, question: application.questions[0]! };
}

test("same-team users cannot list, edit, link, or capture each other's career memory", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: {
      slug: `career-privacy-${suffix}`,
      name: "Career privacy",
      planId: "free_v1",
      plan: PlanType.FREE,
      planCategory: PlanCategory.STANDARD,
      nextPaymentAmount: 0,
    },
  });
  const [userA, userB] = await Promise.all([
    prisma.user.create({
      data: {
        loginId: `career-a-${suffix}`,
        label: "Career A",
        email: `career-a-${suffix}@example.com`,
      },
    }),
    prisma.user.create({
      data: {
        loginId: `career-b-${suffix}`,
        label: "Career B",
        email: `career-b-${suffix}@example.com`,
      },
    }),
  ]);
  await prisma.teamMember.createMany({
    data: [
      { teamId: team.id, userId: userA.id, role: TeamRole.MEMBER },
      { teamId: team.id, userId: userB.id, role: TeamRole.MEMBER },
    ],
  });

  try {
    const [brickA, brickB] = await Promise.all([
      prisma.experienceBrick.create({
        data: {
          userId: userA.id,
          teamId: team.id,
          title: "A private experience",
          content: "A only",
          tags: [],
        },
      }),
      prisma.experienceBrick.create({
        data: {
          userId: userB.id,
          teamId: team.id,
          title: "B private experience",
          content: "B only",
          tags: [],
        },
      }),
    ]);
    const application = await prisma.application.create({
      data: {
        userId: userA.id,
        teamId: team.id,
        companyName: "Acme",
        jobTitle: "Engineer",
        questions: { create: { questionText: "Describe impact" } },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;

    const page = await getExperienceBricks({
      userId: userA.id,
      page: 1,
      pageSize: 100,
    });
    assert.deepEqual(page.items.map((item) => item.id), [brickA.id]);

    await assert.rejects(
      updateExperienceBrick(brickB.id, userA.id, { title: "stolen" }),
      /Unauthorized/,
    );
    await assert.rejects(
      updateResumeQuestion({
        userId: userA.id,
        questionId: question.id,
        relatedBricks: [{ id: brickB.id }],
      }),
      /application owner/,
    );
    await assert.rejects(
      createCareerCandidate({
        userId: userA.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.LINK,
        targetExperienceId: brickB.id,
        fields: {
          title: "Attempted link",
          content: "Should not link",
        },
      }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 404 && value.code === "CAREER_TARGET_NOT_FOUND";
      },
    );
    const candidateA = await createCareerCandidate({
      userId: userA.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "A pending candidate",
        content: "A private pending candidate",
      },
    });
    const visibleToB = await listCareerCandidates({ userId: userB.id });
    assert.equal(
      visibleToB.some((candidate) => candidate.id === candidateA.id),
      false,
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }
});

test("generation DTO and grounding expose only owner-scoped trusted facts", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: {
      slug: `career-trust-${suffix}`,
      name: "Career trust",
      planId: "free_v1",
      plan: PlanType.FREE,
      planCategory: PlanCategory.STANDARD,
      nextPaymentAmount: 0,
    },
  });
  const user = await prisma.user.create({
    data: {
      loginId: `career-trust-${suffix}`,
      label: "Career trust user",
      email: `career-trust-${suffix}@example.com`,
      memberships: {
        create: { teamId: team.id, role: TeamRole.MEMBER },
      },
    },
  });
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        teamId: team.id,
        title: "Secret title 999%",
        content: "SecretOrg and unsupported metric 999%",
        organization: "SecretOrg",
        metrics: ["999%"],
        tags: [],
      },
    });
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        teamId: team.id,
        companyName: "Target",
        jobTitle: "Target role",
        questions: { create: { questionText: "Describe work" } },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    const [trustedFact, needsReviewFact] = await prisma.$transaction([
      prisma.careerFact.create({
        data: {
          userId: user.id,
          experienceId: experience.id,
          kind: CareerFactKind.ACTION,
          value: "Built a trusted service",
          normalizedValue: "built a trusted service",
          fieldPath: "actions[0]",
          trustStatus: CareerFactTrustStatus.TRUSTED,
        },
      }),
      prisma.careerFact.create({
        data: {
          userId: user.id,
          experienceId: experience.id,
          kind: CareerFactKind.ORGANIZATION,
          value: "SecretOrg",
          normalizedValue: "secretorg",
          fieldPath: "organization",
          trustStatus: CareerFactTrustStatus.NEEDS_REVIEW,
        },
      }),
    ]);
    await updateResumeQuestion({
      userId: user.id,
      questionId: question.id,
      relatedBricks: [{ id: experience.id }],
    });

    const context = await buildResumeAiContext({
      userId: user.id,
      teamId: team.id,
      applicationId: application.id,
      questionId: question.id,
    });
    const serialized = JSON.stringify(context.currentQuestion?.selectedBricks);
    assert.match(serialized, /Built a trusted service/);
    assert.doesNotMatch(serialized, /SecretOrg|999%|Secret title/);

    await assert.rejects(
      persistCareerGrounding({
        questionId: question.id,
        userId: user.id,
        operation: CareerGroundingOperation.GENERATE,
        answer: "Unsupported",
        query: "query",
        modelVersion: "test",
        retrievalVersion: "test",
        usedExperienceIds: [],
        usedFactIds: [needsReviewFact.id],
        retrievedExperienceIds: [],
        retrievedFactIds: [needsReviewFact.id],
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "CAREER_GROUNDING_UNTRUSTED",
    );
    const grounding = await persistCareerGrounding({
      questionId: question.id,
      userId: user.id,
      operation: CareerGroundingOperation.GENERATE,
      answer: "Supported",
      query: "query",
      modelVersion: "test",
      retrievalVersion: "test",
      usedExperienceIds: [experience.id],
      usedFactIds: [trustedFact.id],
      retrievedExperienceIds: [experience.id],
      retrievedFactIds: [trustedFact.id],
    });
    assert.equal(grounding.facts[0]?.factId, trustedFact.id);
  } finally {
    await prisma.careerAnswerGrounding.deleteMany({
      where: { question: { application: { userId: user.id } } },
    });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("resume AI context excludes facts under an unconfirmed selected experience", async () => {
  const user = await createTestUser("context-unconfirmed-owner");
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Pending private role",
        content: "Pending private role content",
        tags: [],
        memoryStatus: CareerExperienceStatus.NEEDS_REVIEW,
      },
    });
    await prisma.careerFact.create({
      data: {
        experienceId: experience.id,
        userId: user.id,
        kind: CareerFactKind.SUMMARY,
        fieldPath: "summary",
        value: "MUST_NOT_LEAK_UNCONFIRMED_PARENT",
        normalizedValue: "must_not_leak_unconfirmed_parent",
        trustStatus: CareerFactTrustStatus.TRUSTED,
        active: true,
      },
    });

    const { application, question } = await createContextApplication(user.id, experience.id);
    const context = await buildResumeAiContext({
      userId: user.id,
      teamId: "context-team",
      applicationId: application.id,
      questionId: question.id,
    });

    assert.deepEqual(context.currentQuestion?.selectedBricks, []);
    assert.doesNotMatch(JSON.stringify(context), /MUST_NOT_LEAK_UNCONFIRMED_PARENT/);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("resume AI context excludes a mismatched-owner fact nested under an owned experience", async () => {
  const [owner, other] = await Promise.all([
    createTestUser("context-fact-owner"),
    createTestUser("context-fact-other"),
  ]);
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: owner.id,
        title: "Owned confirmed role",
        content: "Owned confirmed role content",
        tags: [],
        memoryStatus: CareerExperienceStatus.CONFIRMED,
      },
    });
    await prisma.careerFact.createMany({
      data: [
        {
          experienceId: experience.id,
          userId: owner.id,
          kind: CareerFactKind.ACTION,
          fieldPath: "actions[0]",
          value: "SAFE_OWNER_FACT",
          normalizedValue: "safe_owner_fact",
          trustStatus: CareerFactTrustStatus.TRUSTED,
          active: true,
        },
        {
          experienceId: experience.id,
          userId: other.id,
          kind: CareerFactKind.SUMMARY,
          fieldPath: "summary",
          value: "MUST_NOT_LEAK_FOREIGN_NESTED_FACT",
          normalizedValue: "must_not_leak_foreign_nested_fact",
          trustStatus: CareerFactTrustStatus.TRUSTED,
          active: true,
        },
      ],
    });

    const { application, question } = await createContextApplication(owner.id, experience.id);
    const context = await buildResumeAiContext({
      userId: owner.id,
      teamId: "context-team",
      applicationId: application.id,
      questionId: question.id,
    });

    assert.equal(context.currentQuestion?.selectedBricks.length, 1);
    assert.doesNotMatch(
      context.currentQuestion?.selectedBricks[0]?.content ?? "",
      /MUST_NOT_LEAK_FOREIGN_NESTED_FACT/,
    );
    assert.doesNotMatch(JSON.stringify(context), /MUST_NOT_LEAK_FOREIGN_NESTED_FACT/);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});
