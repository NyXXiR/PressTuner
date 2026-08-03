import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerEvidenceOrigin,
  CareerFactTrustStatus,
} from "@prisma/client";

import { fingerprintCareerValue } from "@/domain/career-memory/evidencePolicy";
import { prisma } from "@/lib/prisma";
import {
  createCareerCandidate,
  decideCareerCandidate,
} from "./careerCandidateService";
import { rebuildCareerFacts } from "./careerFactService";

async function testUser(label: string) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      loginId: `fact-${label}-${suffix}`,
      label: `Fact ${label}`,
      email: `fact-${label}-${suffix}@example.com`,
    },
  });
}

test("public fact rebuild fails closed for unsupported high-risk values", async () => {
  const user = await testUser("fail-closed");
  try {
    const experience = await prisma.experienceBrick.create({
      data: {
        userId: user.id,
        title: "Raw PDF title",
        content: "Raw PDF content",
        organization: "Unsupported Org",
        roleTitle: "Unsupported Role",
        metrics: ["900%"],
        actions: ["Built a service"],
        tags: [],
        source: "FILE_PARSE",
        memoryStatus: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByUserId: user.id,
      },
    });

    await rebuildCareerFacts({ userId: user.id, experienceId: experience.id });
    const facts = await prisma.careerFact.findMany({
      where: { experienceId: experience.id, active: true },
    });
    for (const highRiskPath of ["organization", "roleTitle", "metrics[0]"]) {
      assert.equal(
        facts.find((fact) => fact.fieldPath === highRiskPath)?.trustStatus,
        CareerFactTrustStatus.NEEDS_REVIEW,
      );
    }
    assert.equal(
      facts.find((fact) => fact.fieldPath === "actions[0]")?.trustStatus,
      CareerFactTrustStatus.TRUSTED,
    );
    assert.equal(
      await prisma.careerFactEvidence.count({
        where: { fact: { experienceId: experience.id, active: true } },
      }),
      0,
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("approved source evidence preserves every exact row and rejects stale hashes on rebuild", async () => {
  const user = await testUser("exact-source");
  try {
    const source = await prisma.careerSource.create({
      data: {
        userId: user.id,
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        checksum: randomUUID(),
        byteSize: 100,
        status: "READY",
      },
    });
    const chunk = await prisma.careerSourceChunk.create({
      data: {
        sourceId: source.id,
        userId: user.id,
        ordinal: 0,
        content: "Acme grew by 25%.",
        contentHash: randomUUID(),
        pageStart: 1,
        pageEnd: 1,
      },
    });
    const organizationHash = fingerprintCareerValue("Acme");
    const candidate = await createCareerCandidate({
      userId: user.id,
      sourceId: source.id,
      origin: CareerCandidateOrigin.PDF,
      mode: CareerCandidateMode.CREATE,
      fields: {
        title: "PDF candidate",
        content: "Extracted content",
        organization: "Acme",
        metrics: ["25%"],
      },
      evidence: [
        {
          sourceChunkId: chunk.id,
          fieldPath: "organization",
          origin: CareerEvidenceOrigin.SOURCE_EXCERPT,
          valueHash: organizationHash,
          excerpt: "Acme",
          pageStart: 1,
          pageEnd: 1,
        },
        {
          sourceChunkId: chunk.id,
          fieldPath: "organization",
          origin: CareerEvidenceOrigin.SOURCE_EXCERPT,
          valueHash: organizationHash,
          excerpt: "Acme grew",
          pageStart: 1,
          pageEnd: 1,
        },
        {
          sourceChunkId: chunk.id,
          fieldPath: "metrics[0]",
          origin: CareerEvidenceOrigin.SOURCE_EXCERPT,
          valueHash: fingerprintCareerValue("30%"),
          excerpt: "25%",
          pageStart: 1,
          pageEnd: 1,
        },
      ],
    });
    const decision = await decideCareerCandidate({
      candidateId: candidate.id,
      userId: user.id,
      decision: "APPROVE",
    });
    assert.ok(decision.experienceId);

    const organization = await prisma.careerFact.findFirstOrThrow({
      where: {
        experienceId: decision.experienceId!,
        active: true,
        fieldPath: "organization",
      },
      include: { evidence: true },
    });
    assert.equal(organization.trustStatus, CareerFactTrustStatus.TRUSTED);
    assert.equal(organization.evidence.length, 2);
    assert.deepEqual(
      organization.evidence.map((item) => item.excerpt).sort(),
      ["Acme", "Acme grew"],
    );

    const metric = await prisma.careerFact.findFirstOrThrow({
      where: {
        experienceId: decision.experienceId!,
        active: true,
        fieldPath: "metrics[0]",
      },
      include: { evidence: true },
    });
    assert.equal(metric.trustStatus, CareerFactTrustStatus.NEEDS_REVIEW);
    assert.equal(metric.evidence.length, 0);

    await prisma.experienceBrick.update({
      where: { id: decision.experienceId! },
      data: { organization: "Different Org" },
    });
    await rebuildCareerFacts({
      userId: user.id,
      experienceId: decision.experienceId!,
    });
    const changedOrganization = await prisma.careerFact.findFirstOrThrow({
      where: {
        experienceId: decision.experienceId!,
        active: true,
        fieldPath: "organization",
      },
      include: { evidence: true },
    });
    assert.equal(
      changedOrganization.trustStatus,
      CareerFactTrustStatus.NEEDS_REVIEW,
    );
    assert.equal(changedOrganization.evidence.length, 0);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
