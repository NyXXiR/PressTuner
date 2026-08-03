import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { evaluateFeedbackEligibility, type FeedbackCandidateInput } from "@/domain/evaluation/feedbackEligibility";
import { type AgentFailureCategory } from "@/domain/evaluation/failureTaxonomy";
import { redactRegressionExcerpt } from "@/domain/evaluation/sensitiveDataRedaction";
import { canonicalJson } from "@/domain/evaluation/configurationIdentity";
import { prisma } from "@/lib/prisma";

export type RegressionCandidateSignal = FeedbackCandidateInput & {
  sourceId: string;
  excerpt: string;
  failureCategory: AgentFailureCategory;
  logicalSourceRefs?: string[];
};

type RegressionCandidateClient = Pick<
  Prisma.TransactionClient,
  "agentRegressionCandidate" | "agentRegressionCandidateSource"
>;

export async function ingestRegressionCandidateWithClient(
  client: RegressionCandidateClient,
  signal: RegressionCandidateSignal,
) {
  const redaction = redactRegressionExcerpt(signal.excerpt);
  const eligibility = evaluateFeedbackEligibility({
    ...signal,
    containsProhibitedData: redaction.redactionCount > 0,
  });
  if (!eligibility.eligible) return { ingested: false as const, eligibility };
  const payload = {
    failureCategory: signal.failureCategory,
    excerpt: redaction.excerpt,
    logicalSourceRefs: [...new Set(signal.logicalSourceRefs ?? [])].sort(),
  };
  const dedupeHash = createHash("sha256")
    .update(canonicalJson({ teamId: signal.targetTeamId, payload }))
    .digest("hex");
  const record = await client.agentRegressionCandidate.upsert({
      where: { dedupeHash },
      create: {
        teamId: signal.targetTeamId,
        dedupeHash,
        failureCategory: signal.failureCategory,
        payload: payload as Prisma.InputJsonValue,
        consentEligible: signal.consent,
        evaluationEligible: signal.eligibleForEvaluation,
        redactionResult: redaction as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  await client.agentRegressionCandidateSource.upsert({
      where: {
        candidateId_sourceKind_sourceId: {
          candidateId: record.id,
          sourceKind: signal.sourceKind,
          sourceId: signal.sourceId,
        },
      },
      create: {
        candidateId: record.id,
        sourceKind: signal.sourceKind,
        sourceId: signal.sourceId,
        sourceHash: redaction.sourceHash,
        provenance: {
          logicalSourceRefs: payload.logicalSourceRefs,
          terminal: signal.terminal,
        },
      },
      update: {},
    });
  return { ingested: true as const, candidate: record, eligibility };
}

export async function ingestRegressionCandidate(signal: RegressionCandidateSignal) {
  return prisma.$transaction((tx) => ingestRegressionCandidateWithClient(tx, signal));
}

export async function listRegressionCandidates(args: { teamId: string }) {
  return prisma.agentRegressionCandidate.findMany({
    where: { teamId: args.teamId },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewRegressionCandidate(args: {
  teamId: string;
  candidateId: string;
  reviewerId: string;
  decision: "ACCEPTED" | "REJECTED";
  reason?: string;
}) {
  if (args.decision === "REJECTED" && !args.reason?.trim()) {
    throw new Error("REGRESSION_CANDIDATE_REJECTION_REASON_REQUIRED");
  }
  const updated = await prisma.agentRegressionCandidate.updateMany({
    where: { id: args.candidateId, teamId: args.teamId, reviewState: "PENDING" },
    data: {
      reviewState: args.decision,
      reviewedById: args.reviewerId,
      reviewedAt: new Date(),
      rejectionReason: args.decision === "REJECTED" ? args.reason!.trim() : null,
    },
  });
  if (updated.count !== 1) throw new Error("REGRESSION_CANDIDATE_NOT_REVIEWABLE");
  return prisma.agentRegressionCandidate.findFirstOrThrow({
    where: { id: args.candidateId, teamId: args.teamId },
  });
}
