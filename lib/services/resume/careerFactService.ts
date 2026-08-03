import {
  CareerEvidenceOrigin,
  CareerFactKind,
  CareerFactTrustStatus,
  CareerExperienceStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  classifyCareerFieldRisk,
  fingerprintCareerValue,
  isCompatibleCareerFactKind,
} from "@/domain/career-memory/evidencePolicy";
import { projectCareerFacts } from "@/domain/career-memory/factProjection";
import { prisma } from "@/lib/prisma";
import {
  invalidateCareerExperienceInTransaction,
  requestCareerExperienceIndex,
  type CareerIndexTarget,
} from "./careerIndexService";

export type CareerTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type CareerFactEvidenceInput = {
  fieldPath: string;
  excerpt: string;
  sourceChunkId?: string | null;
  origin?: CareerEvidenceOrigin | null;
  valueHash?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
};

type EvidenceProjection = CareerFactEvidenceInput & {
  candidateId: string | null;
};

const FACT_EVIDENCE_WRITE_CHUNK_SIZE = 500;

export async function lockOwnerCareerExperience(input: {
  tx: CareerTransactionClient;
  userId: string;
  experienceId: string;
}) {
  const rows = await input.tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "experience_brick"
    WHERE "id" = ${input.experienceId}
      AND "user_id" = ${input.userId}
    FOR UPDATE
  `;
  return rows.length === 1;
}

function evidenceProjection(
  evidence: CareerFactEvidenceInput,
  candidateId: string | null,
): EvidenceProjection {
  return {
    candidateId,
    sourceChunkId: evidence.sourceChunkId ?? null,
    fieldPath: evidence.fieldPath,
    origin: evidence.origin ?? null,
    valueHash: evidence.valueHash ?? null,
    excerpt: evidence.excerpt,
    pageStart: evidence.pageStart ?? null,
    pageEnd: evidence.pageEnd ?? null,
  };
}

/**
 * Rebuilds the active projection and deliberately fails closed for high-risk facts.
 * Every evidence row is re-matched against the final path, value fingerprint and
 * fact kind; callers cannot preserve trust merely by passing a path-shaped row.
 */
export async function rebuildCareerFactsInTransaction(input: {
  tx: CareerTransactionClient;
  userId: string;
  experienceId: string;
  candidateId?: string | null;
  evidence?: readonly CareerFactEvidenceInput[];
}) {
  const locked = await lockOwnerCareerExperience(input);
  if (!locked) throw new Error("Career experience not found");

  const experience = await input.tx.experienceBrick.findFirst({
    where: { id: input.experienceId, userId: input.userId },
  });
  if (!experience) throw new Error("Career experience not found");

  const previousFacts = await input.tx.careerFact.findMany({
    where: { experienceId: experience.id, userId: input.userId, active: true },
    include: { evidence: true },
  });
  await input.tx.careerFact.updateMany({
    where: {
      experienceId: experience.id,
      userId: input.userId,
      active: true,
    },
    data: { active: false },
  });

  if (experience.memoryStatus !== CareerExperienceStatus.CONFIRMED) return [];

  const suppliedEvidence = (input.evidence ?? []).map((item) =>
    evidenceProjection(item, input.candidateId ?? null),
  );
  const priorEvidence: EvidenceProjection[] = previousFacts.flatMap((fact) =>
    fact.evidence.map((item) => evidenceProjection(item, item.candidateId)),
  );
  const allEvidence = [...priorEvidence, ...suppliedEvidence];
  const candidateIds = [
    ...new Set(
      allEvidence
        .map((item) => item.candidateId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const chunkIds = [
    ...new Set(
      allEvidence
        .map((item) => item.sourceChunkId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [ownedCandidates, ownedChunks] = await Promise.all([
    candidateIds.length
      ? input.tx.careerExperienceCandidate.findMany({
          where: { id: { in: candidateIds }, userId: input.userId },
          select: {
            id: true,
            status: true,
            reviewedByUserId: true,
          },
        })
      : [],
    chunkIds.length
      ? input.tx.careerSourceChunk.findMany({
          where: {
            id: { in: chunkIds },
            userId: input.userId,
            source: { deletedAt: null },
          },
          select: { id: true },
        })
      : [],
  ]);
  const ownedCandidateIds = new Set(ownedCandidates.map((candidate) => candidate.id));
  const approvedCandidateIds = new Set(
    ownedCandidates
      .filter(
        (candidate) =>
          candidate.status === "APPROVED" &&
          candidate.reviewedByUserId === input.userId,
      )
      .map((candidate) => candidate.id),
  );
  const ownedChunkIds = new Set(ownedChunks.map((chunk) => chunk.id));
  const isOwnerScoped = (evidence: EvidenceProjection) =>
    (!evidence.candidateId || ownedCandidateIds.has(evidence.candidateId)) &&
    (!evidence.sourceChunkId || ownedChunkIds.has(evidence.sourceChunkId));
  const isTrustedProvenance = (evidence: EvidenceProjection) => {
    if (!evidence.candidateId || !approvedCandidateIds.has(evidence.candidateId)) {
      return false;
    }
    if (evidence.origin === CareerEvidenceOrigin.USER_ASSERTION) return true;
    return (
      evidence.origin === CareerEvidenceOrigin.SOURCE_EXCERPT &&
      Boolean(evidence.sourceChunkId) &&
      ownedChunkIds.has(evidence.sourceChunkId!)
    );
  };

  const projected = projectCareerFacts(experience).map((fact) => {
    const factHash = fingerprintCareerValue(fact.value);
    const matchingEvidence = allEvidence.filter(
      (evidence) =>
        isOwnerScoped(evidence) &&
        evidence.fieldPath === fact.fieldPath &&
        evidence.valueHash === factHash &&
        isCompatibleCareerFactKind(fact.kind, evidence.fieldPath),
    );
    const isHighRisk = classifyCareerFieldRisk(fact.fieldPath) !== "OTHER";
    const trusted = isHighRisk
      ? matchingEvidence.some(isTrustedProvenance)
      : experience.confirmedByUserId === input.userId;

    return {
      fact,
      matchingEvidence,
      trustStatus: trusted
        ? CareerFactTrustStatus.TRUSTED
        : CareerFactTrustStatus.NEEDS_REVIEW,
    };
  });
  if (projected.length === 0) return [];

  const inserted = await input.tx.careerFact.createManyAndReturn({
    data: projected.map(({ fact, trustStatus }) => ({
      userId: input.userId,
      experienceId: experience.id,
      kind: fact.kind as CareerFactKind,
      fieldPath: fact.fieldPath,
      value: fact.value,
      normalizedValue: fact.normalizedValue,
      active: true,
      trustStatus,
    })),
  });
  const insertedByFieldPath = new Map(inserted.map((fact) => [fact.fieldPath, fact]));
  const created = projected.map(({ fact }) => {
    const insertedFact = insertedByFieldPath.get(fact.fieldPath);
    if (!insertedFact) throw new Error(`Career fact insert missing ${fact.fieldPath}`);
    return insertedFact;
  });
  const evidenceRows = projected.flatMap(({ fact, matchingEvidence }) => {
    const factId = insertedByFieldPath.get(fact.fieldPath)?.id;
    if (!factId) throw new Error(`Career fact evidence mapping missing ${fact.fieldPath}`);
    return matchingEvidence.map((evidence) => ({
      factId,
      candidateId: evidence.candidateId,
      sourceChunkId: evidence.sourceChunkId ?? null,
      fieldPath: evidence.fieldPath,
      origin: evidence.origin ?? null,
      valueHash: evidence.valueHash ?? null,
      excerpt: evidence.excerpt,
      pageStart: evidence.pageStart ?? null,
      pageEnd: evidence.pageEnd ?? null,
    }));
  });
  for (
    let offset = 0;
    offset < evidenceRows.length;
    offset += FACT_EVIDENCE_WRITE_CHUNK_SIZE
  ) {
    await input.tx.careerFactEvidence.createMany({
      data: evidenceRows.slice(offset, offset + FACT_EVIDENCE_WRITE_CHUNK_SIZE),
    });
  }
  return created;
}

export async function rebuildCareerFacts(input: {
  userId: string;
  experienceId: string;
}) {
  let indexTarget: CareerIndexTarget | null = null;
  const facts = await prisma.$transaction(async (tx) => {
    const facts = await rebuildCareerFactsInTransaction({ ...input, tx });
    await tx.user.update({
      where: { id: input.userId },
      data: { careerMemoryVersion: { increment: 1 } },
    });
    indexTarget = await invalidateCareerExperienceInTransaction({
      tx,
      userId: input.userId,
      experienceId: input.experienceId,
    });
    return facts;
  });
  await requestCareerExperienceIndex(indexTarget);
  return facts;
}

export function experienceEmbeddingContent(
  experience: Pick<
    Prisma.ExperienceBrickGetPayload<Record<string, never>>,
    | "title"
    | "content"
    | "organization"
    | "roleTitle"
    | "experienceType"
    | "period"
    | "actions"
    | "outcomes"
    | "metrics"
    | "tools"
    | "tags"
  >,
) {
  return [
    experience.title,
    experience.organization,
    experience.roleTitle,
    experience.experienceType,
    experience.period,
    experience.content,
    ...experience.actions,
    ...experience.outcomes,
    ...experience.metrics,
    ...experience.tools,
    ...experience.tags,
  ]
    .filter(Boolean)
    .join("\n");
}
