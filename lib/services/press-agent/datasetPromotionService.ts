import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { canonicalJson } from "@/domain/evaluation/configurationIdentity";
import { prisma } from "@/lib/prisma";

export async function promoteReviewedCandidates(args: {
  teamId: string;
  reviewerId: string;
  parentDatasetVersionId: string;
  candidateIds: string[];
  name: string;
}) {
  const candidateIds = [...new Set(args.candidateIds)].sort();
  if (candidateIds.length === 0) throw new Error("DATASET_PROMOTION_CANDIDATES_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const parent = await tx.agentDatasetVersion.findFirst({
      where: { id: args.parentDatasetVersionId, teamId: args.teamId },
    });
    if (!parent) throw new Error("DATASET_PARENT_NOT_FOUND");
    const parentCases = await tx.agentDatasetCase.findMany({
      where: { datasetVersionId: parent.id },
      orderBy: { caseKey: "asc" },
    });
    const candidates = await tx.agentRegressionCandidate.findMany({
      where: {
        id: { in: candidateIds },
        teamId: args.teamId,
        reviewState: "ACCEPTED",
        consentEligible: true,
        evaluationEligible: true,
      },
      orderBy: { id: "asc" },
    });
    if (candidates.length !== candidateIds.length) {
      throw new Error("DATASET_PROMOTION_REQUIRES_REVIEWED_ELIGIBLE_CANDIDATES");
    }
    const additions = candidates.map((candidate) => ({
      caseKey: `regression-${candidate.dedupeHash.slice(0, 16)}`,
      payload: candidate.payload,
      contentHash: createHash("sha256").update(canonicalJson(candidate.payload)).digest("hex"),
    }));
    const allCases = [
      ...parentCases.map(({ caseKey, payload, contentHash }) => ({ caseKey, payload, contentHash })),
      ...additions,
    ];
    const contentHash = createHash("sha256")
      .update(canonicalJson({ parent: parent.contentHash, cases: allCases }))
      .digest("hex");
    const existing = await tx.agentDatasetVersion.findUnique({
      where: {
        teamId_contentHash: { teamId: args.teamId, contentHash },
      },
    });
    if (existing) return existing;
    const dataset = await tx.agentDatasetVersion.create({
      data: {
        teamId: args.teamId,
        name: args.name,
        contentHash,
        parentDatasetVersionId: parent.id,
        createdById: args.reviewerId,
      },
    });
    await tx.agentDatasetCase.createMany({
      data: allCases.map((entry) => ({
        datasetVersionId: dataset.id,
        caseKey: entry.caseKey,
        payload: entry.payload as Prisma.InputJsonValue,
        contentHash: entry.contentHash,
      })),
    });
    for (const [index, candidate] of candidates.entries()) {
      await tx.agentRegressionCandidate.update({
        where: { id: candidate.id },
        data: {
          reviewState: "PROMOTED",
          promotedCaseId: additions[index].caseKey,
        },
      });
    }
    return dataset;
  });
}
