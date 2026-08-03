import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerCandidateStatus,
  CareerEvidenceOrigin,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createCareerCandidate,
  decideCareerCandidate,
} from "./careerCandidateService";
import { rebuildCareerFacts } from "./careerFactService";
import {
  batchCreateExperienceBricks,
  createExperienceBrick,
  deleteExperienceBrick,
  updateExperienceBrick,
} from "./resumeBrickService";

async function createTestUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `raw-brick-${label}-${suffix}`,
      label: `Raw brick ${label}`,
      email: `raw-brick-${label}-${suffix}@example.com`,
    },
  });
}

test("legacy raw create queues a DIRECT_INPUT CREATE candidate with server-derived period", async () => {
  const user = await createTestUser("create");
  try {
    const item = await createExperienceBrick({
      teamId: "legacy-team-id",
      userId: user.id,
      title: "Platform launch",
      content: "Led the platform launch",
      originalText: "Owner-entered launch notes",
      period: "forged client period",
      startDate: new Date("2023-02-20T18:00:00.000Z"),
      endDate: new Date("2024-03-20T18:00:00.000Z"),
      isCurrent: false,
      tags: ["leadership"],
    });

    assert.equal(item.userId, user.id);
    assert.equal(item.origin, CareerCandidateOrigin.DIRECT_INPUT);
    assert.equal(item.mode, CareerCandidateMode.CREATE);
    assert.equal(item.status, CareerCandidateStatus.PENDING);
    assert.equal(item.period, "2023.02 - 2024.03");
    assert.equal(item.startDate?.toISOString(), "2023-02-20T18:00:00.000Z");
    assert.equal(item.endDate?.toISOString(), "2024-03-20T18:00:00.000Z");
    assert.equal(
      item.evidence.every((evidence) => evidence.origin === CareerEvidenceOrigin.USER_ASSERTION),
      true,
    );
    assert.equal(
      item.evidence.some((evidence) => evidence.fieldPath === "period"),
      false,
    );
    assert.equal(
      await prisma.experienceBrick.count({ where: { userId: user.id } }),
      0,
    );
    assert.equal(await prisma.careerFact.count({ where: { userId: user.id } }), 0);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).careerMemoryVersion,
      0,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("approved create, replacement, batch, and reconfirm mutations advance a durable embedding revision", async () => {
  const user = await createTestUser("embedding-revision");
  try {
    const createdCandidate = await createExperienceBrick({
      teamId: "legacy-team-id",
      userId: user.id,
      title: "Revisioned create",
      content: "Initial confirmed content",
      tags: [],
    });
    const createdDecision = await decideCareerCandidate({
      candidateId: createdCandidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const experienceId = createdDecision.experienceId!;
    let experience = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: experienceId },
    });
    assert.equal(experience.embeddingRevision, 1);
    assert.equal(experience.embeddedRevision, null);

    await prisma.experienceBrick.update({
      where: { id: experienceId },
      data: {
        embeddedRevision: 1,
        embeddingContentHash: "old-content",
        embeddingModel: "old-model",
        embeddedAt: new Date(),
      },
    });
    const replacement = await updateExperienceBrick(experienceId, user.id, {
      content: "Replacement content",
    });
    await decideCareerCandidate({
      candidateId: replacement.id,
      userId: user.id,
      decision: "APPROVE",
    });
    experience = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: experienceId },
    });
    assert.equal(experience.embeddingRevision, 2);
    assert.equal(experience.embeddedRevision, null);
    assert.equal(experience.embeddingContentHash, null);
    assert.equal(experience.embeddingModel, null);
    assert.equal(experience.embeddedAt, null);

    await rebuildCareerFacts({ userId: user.id, experienceId });
    experience = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: experienceId },
    });
    assert.equal(experience.embeddingRevision, 3);
    assert.equal(experience.embeddedRevision, null);

    const batch = await batchCreateExperienceBricks({
      teamId: "legacy-team-id",
      userId: user.id,
      items: [
        { title: "Batch one", content: "One", tags: [] },
        { title: "Batch two", content: "Two", tags: [] },
      ],
    });
    for (const candidate of batch) {
      const decision = await decideCareerCandidate({
        candidateId: candidate.id,
        userId: user.id,
        decision: "APPROVE",
      });
      const approved = await prisma.experienceBrick.findUniqueOrThrow({
        where: { id: decision.experienceId! },
      });
      assert.equal(approved.embeddingRevision, 1);
      assert.equal(approved.embeddedRevision, null);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy raw create rejects invalid dates before creating review state", async () => {
  const user = await createTestUser("create-invalid-date");
  try {
    await assert.rejects(
      createExperienceBrick({
        teamId: "legacy-team-id",
        userId: user.id,
        title: "Invalid date",
        content: "Must not create a candidate",
        startDate: "not-a-date",
        tags: [],
      }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 400 && value.code === "CAREER_DATE_POLICY_INVALID";
      },
    );
    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { userId: user.id } }),
      0,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy raw PATCH queues a complete replacement snapshot and approval removes stale values", async () => {
  const [owner, other] = await Promise.all([
    createTestUser("patch-owner"),
    createTestUser("patch-other"),
  ]);
  try {
    const target = await prisma.experienceBrick.create({
      data: {
        userId: owner.id,
        title: "Original title",
        content: "Original content with the incorrect 99% metric",
        originalText: "Original owner notes",
        organization: "Original organization",
        roleTitle: "Original role",
        experienceType: "WORK",
        period: "2020.01 - 2021.01",
        startDate: new Date("2020-01-01T00:00:00.000Z"),
        endDate: new Date("2021-01-01T00:00:00.000Z"),
        isCurrent: false,
        actions: ["Old action"],
        outcomes: ["Old outcome"],
        metrics: ["99% incorrect metric"],
        tools: ["Old tool"],
        tags: ["old"],
        confirmedAt: new Date(),
        confirmedByUserId: owner.id,
      },
    });
    await rebuildCareerFacts({ userId: owner.id, experienceId: target.id });
    const staleMetricFact = await prisma.careerFact.findFirstOrThrow({
      where: {
        experienceId: target.id,
        active: true,
        fieldPath: "metrics[0]",
      },
    });

    await assert.rejects(
      updateExperienceBrick(target.id, other.id, { title: "Foreign edit" }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 404 && value.code === "CAREER_EXPERIENCE_NOT_FOUND";
      },
    );
    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { userId: other.id } }),
      0,
    );

    const item = await updateExperienceBrick(target.id, owner.id, {
      title: "Corrected title",
      content: "Corrected content without the old metric",
      organization: null,
      roleTitle: null,
      startDate: null,
      endDate: new Date("2024-05-18T12:00:00.000Z"),
      isCurrent: false,
      actions: [],
      outcomes: [],
      metrics: [],
      tools: [],
      tags: [],
    });

    assert.equal(item.userId, owner.id);
    assert.equal(item.mode, CareerCandidateMode.AUGMENT);
    assert.equal(item.status, CareerCandidateStatus.PENDING);
    assert.equal(item.targetExperienceId, target.id);
    assert.equal(
      (item as typeof item & { replacementSnapshot?: boolean }).replacementSnapshot,
      true,
    );
    assert.equal(item.title, "Corrected title");
    assert.equal(item.content, "Corrected content without the old metric");
    assert.equal(item.originalText, "Original owner notes");
    assert.equal(item.organization, null);
    assert.equal(item.roleTitle, null);
    assert.equal(item.experienceType, "WORK");
    assert.equal(item.period, "Until 2024.05");
    assert.equal(item.startDate, null);
    assert.equal(item.endDate?.toISOString(), "2024-05-18T12:00:00.000Z");
    assert.equal(item.isCurrent, false);
    assert.deepEqual(item.actions, []);
    assert.deepEqual(item.outcomes, []);
    assert.deepEqual(item.metrics, []);
    assert.deepEqual(item.tools, []);
    assert.deepEqual(item.tags, []);
    assert.deepEqual(
      item.evidence.map((evidence) => evidence.fieldPath).sort(),
      ["endDate", "experienceType", "isCurrent", "summary"],
    );

    const unchanged = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.equal(unchanged.title, "Original title");
    assert.equal(unchanged.period, "2020.01 - 2021.01");
    assert.deepEqual(unchanged.tags, ["old"]);

    await decideCareerCandidate({
      candidateId: item.id,
      userId: owner.id,
      decision: "APPROVE",
    });
    const approved = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.equal(approved.title, "Corrected title");
    assert.equal(approved.content, "Corrected content without the old metric");
    assert.equal(approved.originalText, "Original owner notes");
    assert.equal(approved.organization, null);
    assert.equal(approved.roleTitle, null);
    assert.equal(approved.experienceType, "WORK");
    assert.equal(approved.period, "Until 2024.05");
    assert.equal(approved.startDate, null);
    assert.equal(approved.endDate?.toISOString(), "2024-05-18T12:00:00.000Z");
    assert.equal(approved.isCurrent, false);
    assert.deepEqual(approved.actions, []);
    assert.deepEqual(approved.outcomes, []);
    assert.deepEqual(approved.metrics, []);
    assert.deepEqual(approved.tools, []);
    assert.deepEqual(approved.tags, []);

    const removedMetric = await prisma.careerFact.findUniqueOrThrow({
      where: { id: staleMetricFact.id },
    });
    assert.equal(removedMetric.active, false);
    assert.equal(
      await prisma.careerFact.count({
        where: {
          experienceId: target.id,
          active: true,
          OR: [
            { kind: "METRIC" },
            { value: { contains: "99%" } },
            { value: "Old action" },
            { value: "Old outcome" },
            { value: "Old tool" },
            { value: "old" },
          ],
        },
      }),
      0,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

test("legacy raw PATCH approval applies explicit false and an exact end date to a current target", async () => {
  const user = await createTestUser("patch-end-current");
  try {
    const startDate = new Date("2022-01-01T00:00:00.000Z");
    const endDate = new Date("2025-06-18T12:00:00.000Z");
    const target = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Current role",
        content: "Current role content",
        period: "2022.01 - Present",
        startDate,
        endDate: null,
        isCurrent: true,
        tags: [],
      },
    });

    const candidate = await updateExperienceBrick(target.id, user.id, {
      period: "forged client period",
      endDate,
      isCurrent: false,
    });
    assert.equal(candidate.period, "2022.01 - 2025.06");
    assert.equal(
      candidate.evidence.some((evidence) => evidence.fieldPath === "endDate"),
      true,
    );
    assert.equal(
      candidate.evidence.some((evidence) => evidence.fieldPath === "isCurrent"),
      true,
    );

    await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const approved = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.equal(approved.startDate?.toISOString(), startDate.toISOString());
    assert.equal(approved.endDate?.toISOString(), endDate.toISOString());
    assert.equal(approved.isCurrent, false);
    assert.equal(approved.period, "2022.01 - 2025.06");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy raw PATCH structured-date presence suppresses a conflicting period on approval", async () => {
  const user = await createTestUser("patch-structured-precedence");
  try {
    const startDate = new Date("2019-03-01T00:00:00.000Z");
    const endDate = new Date("2020-08-01T00:00:00.000Z");
    const target = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Historical role",
        content: "Historical role content",
        period: "2019.03 - 2020.08",
        startDate,
        endDate,
        isCurrent: false,
        tags: [],
      },
    });

    const candidate = await updateExperienceBrick(target.id, user.id, {
      startDate: new Date(startDate),
      period: "2024.01 - Present",
    });
    assert.notEqual(candidate.period, "2024.01 - Present");
    for (const fieldPath of ["startDate", "endDate", "isCurrent"]) {
      assert.equal(
        candidate.evidence.some((evidence) => evidence.fieldPath === fieldPath),
        true,
      );
    }

    await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const approved = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.equal(approved.startDate?.toISOString(), startDate.toISOString());
    assert.equal(approved.endDate?.toISOString(), endDate.toISOString());
    assert.equal(approved.isCurrent, false);
    assert.equal(approved.period, "2019.03 - 2020.08");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy raw batch period asserts canonical structured dates", async () => {
  const user = await createTestUser("batch");
  try {
    const items = await batchCreateExperienceBricks({
      teamId: "legacy-team-id",
      userId: user.id,
      items: [
        {
          title: "Current project",
          content: "Building a current project",
          period: "client supplied value",
          startDate: "2024-06-22T00:00:00.000Z",
          endDate: "2025-06-22T00:00:00.000Z",
          isCurrent: true,
          tags: ["current"],
        },
        {
          title: "Legacy import",
          content: "Imported with only a coarse period",
          period: "2021-03 ~ 2022-11",
          tags: [],
        },
      ],
    });

    assert.equal(items.length, 2);
    assert.equal(
      items.every(
        (item) =>
          item.userId === user.id &&
          item.origin === CareerCandidateOrigin.DIRECT_INPUT &&
          item.mode === CareerCandidateMode.CREATE &&
          item.status === CareerCandidateStatus.PENDING,
      ),
      true,
    );
    assert.equal(items[0]!.period, "2024.06 - Present");
    assert.equal(items[0]!.endDate, null);
    assert.equal(items[1]!.period, "2021.03 - 2022.11");
    assert.equal(items[1]!.startDate?.toISOString(), "2021-03-01T00:00:00.000Z");
    assert.equal(items[1]!.endDate?.toISOString(), "2022-11-01T00:00:00.000Z");
    assert.equal(items[1]!.isCurrent, false);
    for (const fieldPath of ["startDate", "endDate", "isCurrent"]) {
      assert.equal(
        items[1]!.evidence.some(
          (evidence) =>
            evidence.fieldPath === fieldPath &&
            evidence.origin === CareerEvidenceOrigin.USER_ASSERTION &&
            evidence.valueHash !== null,
        ),
        true,
      );
    }
    assert.equal(
      await prisma.experienceBrick.count({ where: { userId: user.id } }),
      0,
    );
    assert.equal(await prisma.careerFact.count({ where: { userId: user.id } }), 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy batch validates every shared candidate field before writing and retry has no duplicates", async () => {
  const user = await createTestUser("batch-atomic-validation");
  try {
    const first = { title: "First valid", content: "Must roll back", tags: [] };
    await assert.rejects(
      batchCreateExperienceBricks({
        teamId: "legacy-team-id",
        userId: user.id,
        items: [
          first,
          { title: "t".repeat(201), content: "Later invalid item", tags: [] },
        ],
      }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 400 && value.code === "CAREER_CANDIDATE_PAYLOAD_INVALID";
      },
    );
    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { userId: user.id } }),
      0,
    );

    const retried = await batchCreateExperienceBricks({
      teamId: "legacy-team-id",
      userId: user.id,
      items: [
        first,
        { title: "Second corrected", content: "Now valid", tags: [] },
      ],
    });
    assert.equal(retried.length, 2);
    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { userId: user.id } }),
      2,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy batch accepts the documented maximum candidate count", async () => {
  const user = await createTestUser("batch-max");
  try {
    const items = await batchCreateExperienceBricks({
      teamId: "legacy-team-id",
      userId: user.id,
      items: Array.from({ length: 20 }, (_, index) => ({
        title: `Bounded candidate ${index}`,
        content: `Bounded content ${index}`,
        tags: [],
      })),
    });
    assert.equal(items.length, 20);
    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { userId: user.id } }),
      20,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy batch rejects over-limit work before any candidate write", async () => {
  const user = await createTestUser("batch-over-limit");
  try {
    await assert.rejects(
      batchCreateExperienceBricks({
        teamId: "legacy-team-id",
        userId: user.id,
        items: Array.from({ length: 21 }, (_, index) => ({
          title: `Excess candidate ${index}`,
          content: `Excess content ${index}`,
          tags: [],
        })),
      }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 400 && value.code === "CAREER_CANDIDATE_BATCH_LIMIT_EXCEEDED";
      },
    );
    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { userId: user.id } }),
      0,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("experience deletion cascades targeted candidate states and evidence without crossing owners", async () => {
  const [owner, other] = await Promise.all([
    createTestUser("delete-target-owner"),
    createTestUser("delete-target-other"),
  ]);
  try {
    const createCandidate = await createCareerCandidate({
      userId: owner.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "Cascade target",
        content: "The approved CREATE candidate owns this target",
        metrics: ["10%"],
      },
    });
    const createDecision = await decideCareerCandidate({
      candidateId: createCandidate.id,
      userId: owner.id,
      decision: "APPROVE",
    });
    assert.ok(createDecision.experienceId);
    const targetId = createDecision.experienceId;

    const targetedCandidates = [createCandidate];
    for (const [mode, status] of [
      [CareerCandidateMode.LINK, CareerCandidateStatus.PENDING],
      [CareerCandidateMode.LINK, CareerCandidateStatus.APPROVED],
      [CareerCandidateMode.LINK, CareerCandidateStatus.REJECTED],
      [CareerCandidateMode.AUGMENT, CareerCandidateStatus.PENDING],
      [CareerCandidateMode.AUGMENT, CareerCandidateStatus.APPROVED],
      [CareerCandidateMode.AUGMENT, CareerCandidateStatus.REJECTED],
    ] as const) {
      const candidate = await createCareerCandidate({
        userId: owner.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode,
        targetExperienceId: targetId,
        fields: {
          title: `${mode} ${status}`,
          content: `${status} candidate targeting the deleted experience`,
          metrics: ["10%"],
        },
      });
      targetedCandidates.push(candidate);
      if (status === CareerCandidateStatus.APPROVED) {
        await decideCareerCandidate({
          candidateId: candidate.id,
          userId: owner.id,
          decision: "APPROVE",
        });
      } else if (status === CareerCandidateStatus.REJECTED) {
        await decideCareerCandidate({
          candidateId: candidate.id,
          userId: owner.id,
          decision: "REJECT",
          rejectionReason: "Not part of durable memory",
        });
      }
    }

    const [ownerSurvivor, otherSurvivor] = await Promise.all([
      prisma.experienceBrick.create({
        data: {
          userId: owner.id,
          title: "Same-owner survivor",
          content: "Unrelated owner data",
          tags: [],
        },
      }),
      prisma.experienceBrick.create({
        data: {
          userId: other.id,
          title: "Other-owner survivor",
          content: "Isolated owner data",
          tags: [],
        },
      }),
    ]);
    const [ownerSurvivorCandidate, otherSurvivorCandidate] = await Promise.all([
      createCareerCandidate({
        userId: owner.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.LINK,
        targetExperienceId: ownerSurvivor.id,
        fields: { title: "Owner survivor", content: "Must remain" },
      }),
      createCareerCandidate({
        userId: other.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.AUGMENT,
        targetExperienceId: otherSurvivor.id,
        fields: { title: "Other survivor", content: "Must remain isolated" },
      }),
    ]);

    const targetedIds = targetedCandidates.map((candidate) => candidate.id);
    const targetedStates = await prisma.careerExperienceCandidate.findMany({
      where: { targetExperienceId: targetId },
      select: { mode: true, status: true },
    });
    assert.deepEqual(
      targetedStates.map(({ mode, status }) => `${mode}:${status}`).sort(),
      [
        "CREATE:APPROVED",
        "LINK:PENDING",
        "LINK:APPROVED",
        "LINK:REJECTED",
        "AUGMENT:PENDING",
        "AUGMENT:APPROVED",
        "AUGMENT:REJECTED",
      ].sort(),
    );
    const targetedEvidenceIds = targetedCandidates.flatMap((candidate) =>
      candidate.evidence.map((evidence) => evidence.id),
    );
    const targetedFactEvidenceIds = (
      await prisma.careerFactEvidence.findMany({
        where: { candidateId: { in: targetedIds } },
        select: { id: true },
      })
    ).map((evidence) => evidence.id);

    await deleteExperienceBrick(targetId, owner.id);

    assert.equal(
      await prisma.careerExperienceCandidate.count({ where: { id: { in: targetedIds } } }),
      0,
    );
    assert.equal(
      await prisma.careerCandidateEvidence.count({
        where: { id: { in: targetedEvidenceIds } },
      }),
      0,
    );
    assert.equal(
      await prisma.careerFactEvidence.count({
        where: { id: { in: targetedFactEvidenceIds } },
      }),
      0,
    );
    assert.equal(
      await prisma.experienceBrick.count({
        where: { id: { in: [ownerSurvivor.id, otherSurvivor.id] } },
      }),
      2,
    );
    assert.equal(
      await prisma.careerExperienceCandidate.count({
        where: { id: { in: [ownerSurvivorCandidate.id, otherSurvivorCandidate.id] } },
      }),
      2,
    );
    assert.equal(
      await prisma.careerCandidateEvidence.count({
        where: {
          candidateId: { in: [ownerSurvivorCandidate.id, otherSurvivorCandidate.id] },
        },
      }),
      ownerSurvivorCandidate.evidence.length + otherSurvivorCandidate.evidence.length,
    );
    assert.equal(
      await prisma.user.count({ where: { id: { in: [owner.id, other.id] } } }),
      2,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});
