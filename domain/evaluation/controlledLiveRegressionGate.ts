type MetricCheck = Readonly<{
  metricId: string;
  status: "PASS" | "FAIL" | "NOT_EVALUABLE";
  baseline: number | null;
  candidate: number | null;
  reason: string;
}>;

function metric(
  metricId: string,
  baseline: number | null,
  candidate: number | null,
  pass: (baseline: number, candidate: number) => boolean,
  reason: string,
): MetricCheck {
  if (baseline === null || candidate === null) {
    return { metricId, status: "NOT_EVALUABLE", baseline, candidate, reason: "MEASURED_VALUE_REQUIRED" };
  }
  return { metricId, status: pass(baseline, candidate) ? "PASS" : "FAIL", baseline, candidate, reason };
}

function evaluableValue(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record.status === "EVALUABLE" && typeof record.value === "number" ? record.value : null;
}

export function evaluateControlledLiveRagRegressionGate(args: Readonly<{
  comparison: any;
  calibration: any;
  humanReview: "PENDING" | "APPROVED" | "REJECTED";
}>) {
  const baseline = args.comparison?.baseline ?? {};
  const candidate = args.comparison?.candidate ?? {};
  const checks: MetricCheck[] = [
    metric("retrievalRecallAt5", baseline.retrievalRecallAt5 ?? null, candidate.retrievalRecallAt5 ?? null,
      (b, c) => c >= 0.8 && c >= b, "candidate must reach 0.80 without regression"),
    metric("citationDocumentPrecision", baseline.citationDocumentPrecision ?? 0, candidate.citationDocumentPrecision ?? null,
      (_b, c) => c >= 0.9, "candidate must reach 0.90"),
    metric("answerabilityAccuracy", baseline.answerabilityAccuracy ?? null, candidate.answerabilityAccuracy ?? null,
      (b, c) => c >= 0.9 && c >= b - 0.02, "candidate must reach 0.90 within 0.02 non-regression tolerance"),
    metric("agentCompletionRate", baseline.agentCompletionRate ?? null, candidate.agentCompletionRate ?? null,
      (_b, c) => c >= 0.85, "candidate verified completion must reach 0.85"),
    metric("claimGroundedness", evaluableValue(baseline.claimGroundedness) ?? 0, evaluableValue(candidate.claimGroundedness),
      (_b, c) => args.calibration?.status === "PASS" && c >= 0.9, "calibrated candidate groundedness must reach 0.90"),
    metric("conflictDetection", evaluableValue(baseline.conflictDetection), evaluableValue(candidate.conflictDetection),
      (b, c) => c >= 0.9 && c >= b - 0.02, "candidate conflict detection must reach 0.90 without material regression"),
    metric("p95LatencyMs", baseline.p95LatencyMs ?? null, candidate.p95LatencyMs ?? null,
      (b, c) => c <= 20_000 && c <= b * 1.05, "candidate p95 must be <=20s and within 5% of baseline"),
    metric("totalCostMicros", baseline.totalCostMicros ?? null, candidate.totalCostMicros ?? null,
      (b, c) => c <= Math.max(150_000, b * 1.25), "candidate controlled-run cost must stay within the explicit budget envelope"),
  ];
  const disposition = args.humanReview === "REJECTED" || checks.some(({ status }) => status === "FAIL")
    ? "REJECT"
    : args.humanReview !== "APPROVED" || checks.some(({ status }) => status === "NOT_EVALUABLE")
      ? "NOT_EVALUABLE"
      : "PROMOTE";
  return { version: "press-rag-controlled-live-regression-gate/v1" as const, disposition, humanReview: args.humanReview, checks, deploymentAuthorized: false as const };
}
