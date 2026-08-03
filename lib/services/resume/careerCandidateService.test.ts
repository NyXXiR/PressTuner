import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerEvidenceOrigin,
  CareerFactTrustStatus,
} from "@prisma/client";

import { CAREER_CANDIDATE_FIELD_LIMITS } from "@/domain/career-memory/candidatePolicy";
import { fingerprintCareerValue } from "@/domain/career-memory/evidencePolicy";
import { prisma } from "@/lib/prisma";
import {
  createCareerCandidate,
  createCareerCandidatesAtomic,
  decideCareerCandidate,
  updateCareerCandidate,
} from "./careerCandidateService";
import { rebuildCareerFacts } from "./careerFactService";

async function createTestUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `career-${label}-${suffix}`,
      label: `Career ${label}`,
      email: `career-${label}-${suffix}@example.com`,
    },
  });
}

function evidenceByPath<T extends { fieldPath: string }>(evidence: T[]) {
  return new Map(evidence.map((item) => [item.fieldPath, item]));
}

async function blockedCandidateUpdateCount() {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::INTEGER AS "count"
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND wait_event_type = 'Lock'
      AND query ILIKE 'UPDATE%career_experience_candidate%'
  `;
  return rows[0]?.count ?? 0;
}

async function waitForBlockedCandidateUpdates(expected: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await blockedCandidateUpdateCount()) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${expected} blocked candidate updates`);
}

test("direct input synthesizes exact owner assertions for supplied canonical facts", async () => {
  const user = await createTestUser("direct-evidence");
  try {
    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "  Launch lead  ",
        content: "  Shipped the launch.  ",
        organization: " Acme ",
        roleTitle: " Staff Engineer ",
        experienceType: "WORK",
        startDate: new Date("2023-01-15T18:00:00.000Z"),
        endDate: new Date("2024-02-20T18:00:00.000Z"),
        isCurrent: false,
        actions: [" Led launch "],
        outcomes: ["Improved reliability"],
        metrics: [" 25% conversion ", "25% conversion", "10 hires"],
        tools: ["TypeScript"],
        tags: ["Leadership"],
      },
    });

    const byPath = evidenceByPath(candidate.evidence);
    const expected = new Map<string, unknown>([
      ["summary", "Launch lead\nShipped the launch."],
      ["organization", "Acme"],
      ["roleTitle", "Staff Engineer"],
      ["experienceType", "WORK"],
      ["startDate", candidate.startDate],
      ["endDate", candidate.endDate],
      ["isCurrent", false],
      ["actions[0]", "Led launch"],
      ["outcomes[0]", "Improved reliability"],
      ["metrics[0]", "25% conversion"],
      ["metrics[1]", "10 hires"],
      ["tools[0]", "TypeScript"],
      ["tags[0]", "Leadership"],
    ]);
    assert.deepEqual([...byPath.keys()].sort(), [...expected.keys()].sort());
    for (const [fieldPath, value] of expected) {
      const evidence = byPath.get(fieldPath);
      assert.ok(evidence, `missing ${fieldPath}`);
      assert.equal(evidence.origin, CareerEvidenceOrigin.USER_ASSERTION);
      assert.equal(evidence.valueHash, fingerprintCareerValue(value));
      assert.equal(evidence.sourceChunkId, null);
      assert.equal(evidence.pageStart, null);
      assert.equal(evidence.pageEnd, null);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("candidate patch reconciles only changed canonical evidence and rolls back date failures", async () => {
  const user = await createTestUser("patch-evidence");
  try {
    const created = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "Project",
        content: "Built a system",
        period: "2022 - 2023",
        metrics: ["old metric", "second metric"],
      },
    });
    const originalSummary = created.evidence.find((item) => item.fieldPath === "summary");
    assert.ok(originalSummary);

    const noop = await updateCareerCandidate({
      candidateId: created.id,
      userId: user.id,
      fields: {
        title: "  Project ",
        content: "Built   a system",
        organization: null,
        metrics: ["old metric", "second metric"],
      },
    });
    assert.equal(noop.evidence.find((item) => item.fieldPath === "summary")?.id, originalSummary.id);
    assert.equal(noop.evidence.some((item) => item.fieldPath === "organization"), false);

    const patched = await updateCareerCandidate({
      candidateId: created.id,
      userId: user.id,
      fields: {
        metrics: ["replacement", "old metric"],
        isCurrent: true,
      },
    });
    assert.equal(patched.endDate, null);
    assert.equal(patched.period, "2022.01 - Present");
    const byPath = evidenceByPath(patched.evidence);
    assert.equal(byPath.has("endDate"), false);
    assert.equal(byPath.get("metrics[0]")?.valueHash, fingerprintCareerValue("replacement"));
    assert.equal(byPath.get("metrics[1]")?.valueHash, fingerprintCareerValue("old metric"));
    assert.equal(byPath.has("metrics[2]"), false);
    assert.equal(byPath.get("isCurrent")?.valueHash, fingerprintCareerValue(true));

    const beforeFailure = await prisma.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: created.id },
      include: { evidence: { orderBy: { id: "asc" } } },
    });
    await assert.rejects(
      updateCareerCandidate({
        candidateId: created.id,
        userId: user.id,
        fields: {
          startDate: new Date("2025-01-01T00:00:00.000Z"),
          endDate: new Date("2024-01-01T00:00:00.000Z"),
          isCurrent: false,
          metrics: ["must roll back"],
        },
      }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 400 && value.code === "CAREER_DATE_POLICY_INVALID";
      },
    );
    const afterFailure = await prisma.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: created.id },
      include: { evidence: { orderBy: { id: "asc" } } },
    });
    assert.deepEqual(afterFailure.metrics, beforeFailure.metrics);
    assert.equal(afterFailure.startDate?.toISOString(), beforeFailure.startDate?.toISOString());
    assert.deepEqual(
      afterFailure.evidence.map(({ id, fieldPath, valueHash }) => ({ id, fieldPath, valueHash })),
      beforeFailure.evidence.map(({ id, fieldPath, valueHash }) => ({ id, fieldPath, valueHash })),
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("atomic candidate creation rolls back earlier writes when a later DB check fails", async () => {
  const user = await createTestUser("atomic-batch");
  try {
    await assert.rejects(
      createCareerCandidatesAtomic([
        {
          userId: user.id,
          origin: CareerCandidateOrigin.DIRECT_INPUT,
          mode: CareerCandidateMode.CREATE,
          fields: { title: "Would write first", content: "Must be rolled back" },
        },
        {
          userId: user.id,
          origin: CareerCandidateOrigin.DIRECT_INPUT,
          mode: CareerCandidateMode.CREATE,
          sourceId: randomUUID(),
          fields: { title: "Fails later", content: "Missing source" },
        },
      ]),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 404 && value.code === "CAREER_SOURCE_NOT_FOUND";
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

test("service boundary rejects oversized candidate fields with a domain 400", async () => {
  const user = await createTestUser("payload-bounds");
  try {
    await assert.rejects(
      createCareerCandidate({
        userId: user.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.CREATE,
        fields: {
          title: "t".repeat(CAREER_CANDIDATE_FIELD_LIMITS.title + 1),
          content: "Content",
        },
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

    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: { title: "Bounded patch", content: "Original content" },
    });
    const evidenceIds = candidate.evidence.map((item) => item.id).sort();
    await assert.rejects(
      updateCareerCandidate({
        candidateId: candidate.id,
        userId: user.id,
        fields: {
          content: "c".repeat(CAREER_CANDIDATE_FIELD_LIMITS.content + 1),
        },
      }),
      (error: unknown) => {
        const value = error as { status?: number; code?: string };
        return value.status === 400 && value.code === "CAREER_CANDIDATE_PAYLOAD_INVALID";
      },
    );
    const unchanged = await prisma.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { evidence: true },
    });
    assert.equal(unchanged.content, "Original content");
    assert.deepEqual(unchanged.evidence.map((item) => item.id).sort(), evidenceIds);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("approval wins a queued PATCH race without post-decision evidence replacement", async () => {
  const user = await createTestUser("patch-approval-race");
  let releaseBlocker!: () => void;
  let blockerLocked!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    blockerLocked = resolve;
  });
  try {
    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: { title: "Race original", content: "Approved original content" },
    });
    const originalEvidenceIds = candidate.evidence.map((item) => item.id).sort();
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "career_experience_candidate"
        WHERE "id" = ${candidate.id} AND "user_id" = ${user.id}
        FOR UPDATE
      `;
      blockerLocked();
      await release;
    });
    await locked;

    const approval = decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    await waitForBlockedCandidateUpdates(1);
    const patch = updateCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      fields: { title: "Late patch", organization: "Late organization" },
    });
    await waitForBlockedCandidateUpdates(2);
    releaseBlocker();
    await blocker;

    const [approvalResult, patchResult] = await Promise.allSettled([approval, patch]);
    assert.equal(approvalResult.status, "fulfilled");
    assert.equal(patchResult.status, "rejected");
    if (patchResult.status === "rejected") {
      const error = patchResult.reason as { status?: number; code?: string };
      assert.equal(error.status, 409);
      assert.equal(error.code, "CAREER_CANDIDATE_DECIDED");
    }

    const decided = await prisma.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { evidence: true },
    });
    assert.equal(decided.title, "Race original");
    assert.equal(decided.organization, null);
    assert.deepEqual(decided.evidence.map((item) => item.id).sort(), originalEvidenceIds);
    assert.equal(decided.evidence.some((item) => item.fieldPath === "organization"), false);
  } finally {
    releaseBlocker?.();
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("approval trusts only exact evidence, preserves augment provenance, and links exact facts", async () => {
  const user = await createTestUser("approval-evidence");
  try {
    const baseCandidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "Base",
        content: "Base content",
        organization: "Acme",
        roleTitle: "Engineer",
        metrics: ["10%"],
        actions: ["Built platform"],
      },
    });
    const baseDecision = await decideCareerCandidate({
      candidateId: baseCandidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    assert.ok(baseDecision.experienceId);

    const initialFacts = await prisma.careerFact.findMany({
      where: { experienceId: baseDecision.experienceId!, active: true },
      include: { evidence: true },
    });
    assert.equal(initialFacts.every((fact) => fact.trustStatus === CareerFactTrustStatus.TRUSTED), true);

    const augment = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.AUGMENT,
      targetExperienceId: baseDecision.experienceId,
      fields: {
        title: "Base",
        content: "Additional content",
        metrics: ["20%"],
      },
    });
    await decideCareerCandidate({
      candidateId: augment.id,
      userId: user.id,
      decision: "APPROVE",
    });

    const metricFacts = await prisma.careerFact.findMany({
      where: {
        experienceId: baseDecision.experienceId!,
        active: true,
        kind: "METRIC",
      },
      include: { evidence: true },
      orderBy: { fieldPath: "asc" },
    });
    assert.deepEqual(metricFacts.map((fact) => [fact.fieldPath, fact.value]), [
      ["metrics[0]", "10%"],
      ["metrics[1]", "20%"],
    ]);
    assert.equal(metricFacts[0]!.evidence.some((item) => item.candidateId === baseCandidate.id), true);
    assert.equal(metricFacts[0]!.evidence.some((item) => item.candidateId === augment.id), false);
    assert.equal(metricFacts[1]!.evidence.some((item) => item.candidateId === augment.id), true);

    const mismatchedLink = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.LINK,
      targetExperienceId: baseDecision.experienceId,
      fields: { title: "Link", content: "Link mismatch", metrics: ["99%"] },
    });
    await decideCareerCandidate({
      candidateId: mismatchedLink.id,
      userId: user.id,
      decision: "APPROVE",
    });
    assert.equal(
      await prisma.careerFactEvidence.count({ where: { candidateId: mismatchedLink.id } }),
      0,
    );

    const exactLink = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.LINK,
      targetExperienceId: baseDecision.experienceId,
      fields: { title: "Link", content: "Link exact", metrics: ["10%"] },
    });
    await decideCareerCandidate({
      candidateId: exactLink.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const exactLinks = await prisma.careerFactEvidence.findMany({
      where: { candidateId: exactLink.id },
      include: { fact: true },
    });
    assert.equal(exactLinks.length, 1);
    assert.equal(exactLinks[0]!.fact.fieldPath, "metrics[0]");
    assert.equal(exactLinks[0]!.valueHash, fingerprintCareerValue("10%"));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("concurrent double approval claims once and owner-scopes approval and evidence mutation", async () => {
  const [owner, other] = await Promise.all([
    createTestUser("concurrent-owner"),
    createTestUser("concurrent-other"),
  ]);
  try {
    const candidate = await createCareerCandidate({
      userId: owner.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: { title: `Only once ${randomUUID()}`, content: "One mutation" },
    });
    const beforeEvidence = candidate.evidence.map((item) => item.id);

    await assert.rejects(
      updateCareerCandidate({
        candidateId: candidate.id,
        userId: other.id,
        fields: { organization: "Stolen" },
      }),
      /not found/i,
    );
    await assert.rejects(
      decideCareerCandidate({
        candidateId: candidate.id,
        userId: other.id,
        decision: "APPROVE",
      }),
      /not found/i,
    );
    const afterForeignAttempts = await prisma.careerCandidateEvidence.findMany({
      where: { candidateId: candidate.id },
      orderBy: { id: "asc" },
    });
    assert.deepEqual(afterForeignAttempts.map((item) => item.id).sort(), beforeEvidence.sort());

    const outcomes = await Promise.all([
      decideCareerCandidate({
        candidateId: candidate.id,
        userId: owner.id,
        decision: "APPROVE",
      }),
      decideCareerCandidate({
        candidateId: candidate.id,
        userId: owner.id,
        decision: "APPROVE",
      }),
    ]);
    assert.deepEqual(outcomes.map((item) => item.idempotent).sort(), [false, true]);
    assert.equal(
      await prisma.experienceBrick.count({
        where: { userId: owner.id, title: candidate.title },
      }),
      1,
    );
    const version = await prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
      select: { careerMemoryVersion: true },
    });
    assert.equal(version.careerMemoryVersion, 1);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

test("concurrent distinct AUGMENT approvals serialize target merges and fact rebuilds", async () => {
  const user = await createTestUser("concurrent-augments");
  try {
    const target = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Shared target",
        content: "Base content",
        actions: ["Base action"],
        metrics: ["10%"],
        tags: [],
        memoryStatus: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByUserId: user.id,
      },
    });
    await rebuildCareerFacts({ userId: user.id, experienceId: target.id });
    const [first, second] = await Promise.all([
      createCareerCandidate({
        userId: user.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.AUGMENT,
        targetExperienceId: target.id,
        fields: {
          title: target.title,
          content: "First concurrent addition",
          actions: ["First action"],
          metrics: ["20%"],
        },
      }),
      createCareerCandidate({
        userId: user.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.AUGMENT,
        targetExperienceId: target.id,
        fields: {
          title: target.title,
          content: "Second concurrent addition",
          actions: ["Second action"],
          metrics: ["30%"],
        },
      }),
    ]);

    const decisions = await Promise.all([
      decideCareerCandidate({
        candidateId: first.id,
        userId: user.id,
        decision: "APPROVE",
      }),
      decideCareerCandidate({
        candidateId: second.id,
        userId: user.id,
        decision: "APPROVE",
      }),
    ]);
    assert.equal(decisions.every((decision) => !decision.idempotent), true);

    const finalExperience = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.match(finalExperience.content, /First concurrent addition/);
    assert.match(finalExperience.content, /Second concurrent addition/);
    assert.equal(finalExperience.actions[0], "Base action");
    assert.deepEqual(finalExperience.actions.slice(1).sort(), ["First action", "Second action"]);
    assert.equal(finalExperience.metrics[0], "10%");
    assert.deepEqual(finalExperience.metrics.slice(1).sort(), ["20%", "30%"]);

    const activeFacts = await prisma.careerFact.findMany({
      where: { userId: user.id, experienceId: target.id, active: true },
      include: { evidence: true },
    });
    for (const [value, candidateId] of [
      ["First action", first.id],
      ["Second action", second.id],
      ["20%", first.id],
      ["30%", second.id],
    ] as const) {
      const fact = activeFacts.find((item) => item.value === value);
      assert.ok(fact, `missing active fact for ${value}`);
      assert.equal(fact.evidence.some((item) => item.candidateId === candidateId), true);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("legacy period compatibility is an exact assertion of canonical structured dates", async () => {
  const user = await createTestUser("legacy-period-evidence");
  try {
    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "Legacy period",
        content: "Owner-asserted compatibility period input",
        period: "2022-03 ~ 2023-11",
      },
    });

    assert.equal(candidate.startDate?.toISOString(), "2022-03-01T00:00:00.000Z");
    assert.equal(candidate.endDate?.toISOString(), "2023-11-01T00:00:00.000Z");
    assert.equal(candidate.isCurrent, false);
    const candidateEvidence = evidenceByPath(candidate.evidence);
    const expected = new Map<string, unknown>([
      ["startDate", candidate.startDate],
      ["endDate", candidate.endDate],
      ["isCurrent", false],
    ]);
    for (const [fieldPath, value] of expected) {
      const evidence = candidateEvidence.get(fieldPath);
      assert.ok(evidence, `missing exact ${fieldPath} USER_ASSERTION`);
      assert.equal(evidence.origin, CareerEvidenceOrigin.USER_ASSERTION);
      assert.equal(evidence.valueHash, fingerprintCareerValue(value));
    }

    const decision = await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const dateFacts = await prisma.careerFact.findMany({
      where: {
        experienceId: decision.experienceId!,
        active: true,
        fieldPath: { in: ["startDate", "endDate", "isCurrent"] },
      },
      include: { evidence: true },
    });
    assert.equal(dateFacts.length, 2);
    for (const fact of dateFacts) {
      assert.equal(fact.trustStatus, CareerFactTrustStatus.TRUSTED);
      assert.equal(fact.evidence.length, 1);
      assert.equal(fact.evidence[0]?.origin, CareerEvidenceOrigin.USER_ASSERTION);
      assert.equal(
        fact.evidence[0]?.valueHash,
        fingerprintCareerValue(expected.get(fact.fieldPath)),
      );
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("CREATE approval derives period from structured fields instead of a stale candidate period", async () => {
  const user = await createTestUser("approve-derived-period");
  try {
    const candidate = await prisma.careerExperienceCandidate.create({
      data: {
        userId: user.id,
        origin: CareerCandidateOrigin.DIRECT_INPUT,
        mode: CareerCandidateMode.CREATE,
        title: "Stale candidate period",
        content: "Structured dates are authoritative",
        period: "FORGED_STALE_PERIOD",
        startDate: new Date("2020-04-18T12:00:00.000Z"),
        endDate: new Date("2021-09-29T12:00:00.000Z"),
        isCurrent: false,
      },
    });

    const approved = await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const experience = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: approved.experienceId! },
    });
    assert.equal(experience.period, "2020.04 - 2021.09");
    assert.notEqual(experience.period, candidate.period);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("PDF CREATE approval without hash evidence durably returns the same experience", async () => {
  const user = await createTestUser("pdf-idempotent-create");
  try {
    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.PDF,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: `PDF fallback ${randomUUID()}`,
        content: "Fallback evidence has no canonical value hash",
      },
    });
    assert.equal(candidate.evidence.length, 1);
    assert.equal(candidate.evidence[0]!.fieldPath, "summary");
    assert.equal(candidate.evidence[0]!.valueHash, null);

    const first = await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const second = await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });

    assert.ok(first.experienceId);
    assert.equal(second.experienceId, first.experienceId);
    assert.equal(second.idempotent, true);
    assert.equal(
      await prisma.experienceBrick.count({
        where: { userId: user.id, title: candidate.title },
      }),
      1,
    );
    const decided = await prisma.careerExperienceCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    assert.equal(decided.targetExperienceId, first.experienceId);
    assert.equal(
      await prisma.careerFactEvidence.count({ where: { candidateId: candidate.id } }),
      0,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).careerMemoryVersion,
      1,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("AUGMENT legacy period replaces stale date evidence with exact assertions", async () => {
  const user = await createTestUser("augment-legacy-period");
  try {
    const oldStart = new Date("2019-03-01T00:00:00.000Z");
    const oldEnd = new Date("2020-08-01T00:00:00.000Z");
    const target = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Historical target",
        content: "Historical target content",
        period: "2019.03 - 2020.08",
        startDate: oldStart,
        endDate: oldEnd,
        isCurrent: false,
        tags: [],
        careerFacts: {
          create: [
            {
              userId: user.id,
              kind: "START_DATE",
              fieldPath: "startDate",
              value: oldStart.toISOString(),
              normalizedValue: oldStart.toISOString(),
              evidence: {
                create: {
                  origin: CareerEvidenceOrigin.SOURCE_EXCERPT,
                  fieldPath: "startDate",
                  excerpt: "stale source start",
                  valueHash: fingerprintCareerValue(oldStart),
                },
              },
            },
            {
              userId: user.id,
              kind: "END_DATE",
              fieldPath: "endDate",
              value: oldEnd.toISOString(),
              normalizedValue: oldEnd.toISOString(),
              evidence: {
                create: {
                  origin: CareerEvidenceOrigin.SOURCE_EXCERPT,
                  fieldPath: "endDate",
                  excerpt: "stale source end",
                  valueHash: fingerprintCareerValue(oldEnd),
                },
              },
            },
          ],
        },
      },
    });
    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.AUGMENT,
      targetExperienceId: target.id,
      fields: {
        title: target.title,
        content: "Owner asserts a replacement period",
        period: "2024-01 ~ 현재",
      },
    });
    assert.equal(candidate.startDate?.toISOString(), "2024-01-01T00:00:00.000Z");
    assert.equal(candidate.endDate, null);
    assert.equal(candidate.isCurrent, true);
    const replacementAssertions = new Map<string, unknown>([
      ["startDate", candidate.startDate],
      ["endDate", null],
      ["isCurrent", true],
    ]);
    for (const [fieldPath, value] of replacementAssertions) {
      const evidence = candidate.evidence.find((item) => item.fieldPath === fieldPath);
      assert.ok(evidence, `missing replacement assertion for ${fieldPath}`);
      assert.equal(evidence.origin, CareerEvidenceOrigin.USER_ASSERTION);
      assert.equal(evidence.valueHash, fingerprintCareerValue(value));
      assert.equal(evidence.sourceChunkId, null);
    }

    await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    const approved = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.equal(approved.startDate?.toISOString(), "2024-01-01T00:00:00.000Z");
    assert.equal(approved.endDate, null);
    assert.equal(approved.isCurrent, true);
    assert.equal(approved.period, "2024.01 - Present");

    const facts = await prisma.careerFact.findMany({
      where: {
        experienceId: target.id,
        active: true,
        fieldPath: { in: ["startDate", "endDate", "isCurrent"] },
      },
      include: { evidence: true },
    });
    assert.deepEqual(facts.map((fact) => fact.fieldPath), ["startDate"]);
    for (const fact of facts) {
      assert.equal(fact.trustStatus, CareerFactTrustStatus.TRUSTED);
      assert.equal(fact.evidence.length, 1);
      assert.equal(fact.evidence[0]?.origin, CareerEvidenceOrigin.USER_ASSERTION);
      assert.equal(fact.evidence[0]?.fieldPath, fact.fieldPath);
      assert.equal(
        fact.evidence[0]?.valueHash,
        fingerprintCareerValue(new Date("2024-01-01T00:00:00.000Z")),
      );
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("augment remaps exact assertion to one existing metric without duplicating it", async () => {
  const user = await createTestUser("augment-existing-metric");
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Imported experience",
        content: "Imported without exact metric provenance",
        metrics: ["999%"],
        tags: [],
        source: "FILE_PARSE",
        memoryStatus: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByUserId: user.id,
      },
    });
    await rebuildCareerFacts({ userId: user.id, experienceId: experience.id });
    const unsupported = await prisma.careerFact.findFirstOrThrow({
      where: { experienceId: experience.id, active: true, fieldPath: "metrics[0]" },
    });
    assert.equal(unsupported.trustStatus, CareerFactTrustStatus.NEEDS_REVIEW);

    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode: CareerCandidateMode.AUGMENT,
      targetExperienceId: experience.id,
      fields: {
        title: "Imported experience",
        content: "Owner confirms the existing metric",
        metrics: ["999%"],
      },
    });
    await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });

    const finalExperience = await prisma.experienceBrick.findUniqueOrThrow({
      where: { id: experience.id },
    });
    assert.deepEqual(finalExperience.metrics, ["999%"]);
    const metric = await prisma.careerFact.findFirstOrThrow({
      where: { experienceId: experience.id, active: true, fieldPath: "metrics[0]" },
      include: { evidence: true },
    });
    assert.equal(metric.trustStatus, CareerFactTrustStatus.TRUSTED);
    assert.equal(
      metric.evidence.some((item) => item.candidateId === candidate.id),
      true,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
