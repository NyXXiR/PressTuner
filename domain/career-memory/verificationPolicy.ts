export type CareerVerificationResultValue = "PASS" | "WARN" | "BLOCK";
export type CareerFindingTypeValue =
  | "SUPPORTED"
  | "CONTRADICTION"
  | "UNSUPPORTED";
export type CareerRiskCategoryValue =
  | "NUMBER"
  | "DATE"
  | "ORGANIZATION"
  | "TITLE"
  | "OTHER";

const blockingRisks = new Set<CareerRiskCategoryValue>([
  "NUMBER",
  "DATE",
  "ORGANIZATION",
  "TITLE",
]);

const compatibleFactKinds: Record<
  CareerRiskCategoryValue,
  ReadonlySet<string> | null
> = {
  NUMBER: new Set(["METRIC", "ACTION", "OUTCOME", "SUMMARY"]),
  DATE: new Set(["START_DATE", "END_DATE", "SUMMARY"]),
  ORGANIZATION: new Set(["ORGANIZATION", "SUMMARY"]),
  TITLE: new Set(["TITLE", "SUMMARY"]),
  OTHER: null,
};

export function normalizeCareerFindingSupport<
  T extends {
    type: CareerFindingTypeValue;
    riskCategory: CareerRiskCategoryValue;
    supportingFactIds: readonly string[];
  },
>(
  finding: T,
  facts: readonly { id: string; kind: string }[],
): T & { supportingFactIds: string[] } {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const compatible = compatibleFactKinds[finding.riskCategory];
  const supportingFactIds = finding.supportingFactIds.filter((id) => {
    const fact = factsById.get(id);
    return Boolean(fact && (!compatible || compatible.has(fact.kind)));
  });
  return {
    ...finding,
    type:
      finding.type === "SUPPORTED" &&
      blockingRisks.has(finding.riskCategory) &&
      supportingFactIds.length === 0
        ? "UNSUPPORTED"
        : finding.type,
    supportingFactIds,
  };
}

export function computeCareerVerificationResult(
  findings: readonly {
    type: CareerFindingTypeValue;
    riskCategory: CareerRiskCategoryValue;
  }[],
): CareerVerificationResultValue {
  if (
    findings.some(
      (finding) =>
        finding.type === "CONTRADICTION" ||
        (finding.type === "UNSUPPORTED" &&
          blockingRisks.has(finding.riskCategory)),
    )
  ) {
    return "BLOCK";
  }
  if (findings.some((finding) => finding.type === "UNSUPPORTED")) {
    return "WARN";
  }
  return "PASS";
}

type CurrentCareerState = {
  userId: string;
  answerHash: string;
  answerRevision: number;
  careerMemoryVersion: number;
};

export function isCareerVerificationCurrent(
  verification: CurrentCareerState,
  current: CurrentCareerState,
) {
  return (
    verification.userId === current.userId &&
    verification.answerHash === current.answerHash &&
    verification.answerRevision === current.answerRevision &&
    verification.careerMemoryVersion === current.careerMemoryVersion
  );
}

export function isCareerOverrideCurrent(
  override: {
    userId: string;
    verificationId: string;
    answerHash: string;
    answerRevision: number;
    reason: string;
  },
  verification: CurrentCareerState & { id: string },
  current: CurrentCareerState,
) {
  return (
    override.reason.trim().length > 0 &&
    override.userId === current.userId &&
    override.verificationId === verification.id &&
    override.answerHash === current.answerHash &&
    override.answerRevision === current.answerRevision &&
    isCareerVerificationCurrent(verification, current)
  );
}
