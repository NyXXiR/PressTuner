import { createHash } from "node:crypto";

export type CalibrationSeed = Readonly<{
  id: string;
  factValue: string;
  sourceId: string;
  exactEvidence: string;
}>;

export function buildJudgeCalibrationReviewDraft(seeds: readonly CalibrationSeed[]) {
  if (seeds.length < 15) throw new Error("JUDGE_CALIBRATION_REVIEW_SEEDS_INSUFFICIENT");
  const selected = seeds.slice(0, 15);
  const candidates = selected.flatMap((seed, index) => {
    const unrelated = selected[(index + 1) % selected.length]!;
    return [
      {
        claimId: `cal-supported-${String(index + 1).padStart(2, "0")}`,
        blinded: true as const,
        claim: `문서 식별자는 ${seed.factValue}이다.`,
        evidence: [{ sourceId: seed.sourceId, quote: seed.exactEvidence }],
        suggestedLabel: "SUPPORTED" as const,
        suggestionBasis: "FACT_VALUE_PRESENT_IN_HUMAN_APPROVED_DOCUMENT" as const,
        humanLabel: null,
        reviewerRationale: null,
      },
      {
        claimId: `cal-unsupported-${String(index + 1).padStart(2, "0")}`,
        blinded: true as const,
        claim: `문서 식별자는 ${seed.factValue}이다.`,
        evidence: [{ sourceId: unrelated.sourceId, quote: unrelated.exactEvidence }],
        suggestedLabel: "UNSUPPORTED" as const,
        suggestionBasis: "FACT_VALUE_ABSENT_FROM_DIFFERENT_HUMAN_APPROVED_DOCUMENT" as const,
        humanLabel: null,
        reviewerRationale: null,
      },
    ];
  });
  const contentHash = createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
  return {
    version: "press-rag-judge-calibration-review/v1" as const,
    status: "PENDING_HUMAN_REVIEW" as const,
    contentHash,
    reviewer: null,
    candidates,
  };
}

export function approveJudgeCalibrationReview(args: Readonly<{
  review: ReturnType<typeof buildJudgeCalibrationReviewDraft>;
  reviewerId: string;
  approvedAt: string;
}>) {
  if (args.review.status !== "PENDING_HUMAN_REVIEW") throw new Error("JUDGE_CALIBRATION_REVIEW_NOT_PENDING");
  if (!args.reviewerId.trim() || !Number.isFinite(Date.parse(args.approvedAt))) {
    throw new Error("JUDGE_CALIBRATION_HUMAN_APPROVAL_REQUIRED");
  }
  const contentHash = createHash("sha256").update(JSON.stringify(args.review.candidates)).digest("hex");
  if (contentHash !== args.review.contentHash) throw new Error("JUDGE_CALIBRATION_REVIEW_HASH_MISMATCH");
  return {
    ...args.review,
    status: "APPROVED" as const,
    reviewer: { type: "HUMAN" as const, id: args.reviewerId.trim(), approvedAt: args.approvedAt },
    candidates: args.review.candidates.map((candidate) => ({
      ...candidate,
      humanLabel: candidate.suggestedLabel,
      reviewerRationale: `Human accepted ${candidate.suggestionBasis}`,
    })),
  };
}
