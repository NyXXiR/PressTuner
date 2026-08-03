import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  buildCareerFindingResponseFormat,
  verifyCareerAnswer,
} from "./careerVerificationService";

test("career verifier schema constrains supporting citations to retrieved facts", () => {
  const responseFormat = buildCareerFindingResponseFormat([
    "fact-1",
    "fact-2",
  ]);
  const findingSchema = (
    responseFormat.json_schema.schema.properties.findings as {
      items: {
        properties: {
          supportingFactIds: { items: { enum?: string[] } };
        };
      };
    }
  ).items;

  assert.deepEqual(
    findingSchema.properties.supportingFactIds.items.enum,
    ["fact-1", "fact-2"],
  );
});

async function createUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `career-verification-${label}-${suffix}`,
      label: `Career verification ${label}`,
      email: `career-verification-${label}-${suffix}@example.com`,
    },
  });
}

test("verification independently retrieves a manual edit and excludes another owner's facts", async () => {
  const [owner, other] = await Promise.all([
    createUser("owner"),
    createUser("other"),
  ]);
  try {
    const application = await prisma.application.create({
      data: {
        userId: owner.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: {
            questionText: "Where did you work?",
            answer: "I worked at Apollo.",
            answerRevision: 3,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    const [ownedExperience, foreignExperience] = await Promise.all([
      prisma.experienceBrick.create({
        data: {
          userId: owner.id,
          title: "Apollo role",
          content: "Worked at Apollo",
          organization: "Apollo",
          tags: [],
          memoryStatus: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedByUserId: owner.id,
        },
      }),
      prisma.experienceBrick.create({
        data: {
          userId: other.id,
          title: "Foreign role",
          content: "Private",
          organization: "Foreign Secret",
          tags: [],
          memoryStatus: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedByUserId: other.id,
        },
      }),
    ]);
    const [ownedFact, foreignFact] = await Promise.all([
      prisma.careerFact.create({
        data: {
          userId: owner.id,
          experienceId: ownedExperience.id,
          kind: "ORGANIZATION",
          fieldPath: "organization",
          value: "Apollo",
          normalizedValue: "apollo",
          active: true,
          trustStatus: "TRUSTED",
        },
      }),
      prisma.careerFact.create({
        data: {
          userId: other.id,
          experienceId: foreignExperience.id,
          kind: "ORGANIZATION",
          fieldPath: "organization",
          value: "Foreign Secret",
          normalizedValue: "foreign secret",
          active: true,
          trustStatus: "TRUSTED",
        },
      }),
    ]);
    let classifiedFactIds: string[] = [];

    const verification = await verifyCareerAnswer(
      { questionId: question.id, userId: owner.id },
      {
        extractClaims: async () => [
          { claim: "I worked at Apollo", riskCategory: "ORGANIZATION" },
        ],
        retrieveFacts: async () => [
          {
            ...ownedFact,
            experienceStatus: "CONFIRMED",
          },
          {
            ...foreignFact,
            experienceStatus: "CONFIRMED",
          },
        ],
        classifyClaims: async (input: {
          facts: readonly { id: string }[];
        }) => {
          classifiedFactIds = input.facts.map((fact) => fact.id);
          return [
            {
              type: "SUPPORTED",
              riskCategory: "ORGANIZATION",
              claim: "I worked at Apollo",
              explanation: "Current trusted memory supports the claim",
              supportingFactIds: [ownedFact.id],
            },
          ];
        },
      },
    );

    assert.equal(verification.result, "PASS");
    assert.equal(
      verification.findings[0]?.supportingFacts?.[0]?.value,
      "Apollo",
    );
    assert.deepEqual(classifiedFactIds, [ownedFact.id]);
    assert.equal(
      await prisma.careerAnswerGrounding.count({
        where: { questionId: question.id },
      }),
      0,
    );

    const beforeStale = await prisma.careerAnswerVerification.count({
      where: { questionId: question.id },
    });
    await assert.rejects(
      verifyCareerAnswer(
        { questionId: question.id, userId: owner.id },
        {
          extractClaims: async () => [
            { claim: "I worked at Apollo", riskCategory: "ORGANIZATION" },
          ],
          retrieveFacts: async () => [
            { ...ownedFact, experienceStatus: "CONFIRMED" },
          ],
          classifyClaims: async () => [
            {
              type: "SUPPORTED",
              riskCategory: "ORGANIZATION",
              claim: "I worked at Apollo",
              explanation: "Supported",
              supportingFactIds: [ownedFact.id],
            },
          ],
          beforePersist: async () => {
            await prisma.question.update({
              where: { id: question.id },
              data: {
                answer: "The answer changed concurrently.",
                answerRevision: { increment: 1 },
              },
            });
          },
        },
      ),
      (error: unknown) =>
        (error as { status?: number; code?: string }).status === 409 &&
        (error as { code?: string }).code === "CAREER_VERIFICATION_STALE",
    );
    assert.equal(
      await prisma.careerAnswerVerification.count({
        where: { questionId: question.id },
      }),
      beforeStale,
    );
    assert.equal(
      (await prisma.question.findUniqueOrThrow({ where: { id: question.id } }))
        .isCompleted,
      false,
    );
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  }
});

test("retrieval or verifier failure does not persist verification or complete the question", async () => {
  const owner = await createUser("failure");
  try {
    const application = await prisma.application.create({
      data: {
        userId: owner.id,
        companyName: "Target",
        jobTitle: "Engineer",
        questions: {
          create: {
            questionText: "Describe an outcome",
            answer: "A manual answer",
            answerRevision: 1,
          },
        },
      },
      include: { questions: true },
    });
    const question = application.questions[0]!;
    await assert.rejects(
      verifyCareerAnswer(
        { questionId: question.id, userId: owner.id },
        {
          extractClaims: async () => {
            throw new Error("TRANSIENT_AI_FAILURE");
          },
        },
      ),
      /TRANSIENT_AI_FAILURE/,
    );
    assert.equal(
      await prisma.careerAnswerVerification.count({
        where: { questionId: question.id },
      }),
      0,
    );
    assert.equal(
      (await prisma.question.findUniqueOrThrow({ where: { id: question.id } }))
        .isCompleted,
      false,
    );
  } finally {
    await prisma.user.delete({ where: { id: owner.id } });
  }
});
