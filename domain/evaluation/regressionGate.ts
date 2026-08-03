import type { EvidenceObservation } from "./experimentContracts";

export type GateDisposition = "PROMOTE" | "REJECT" | "NOT_EVALUABLE";
export type MetricDirection = "higher" | "lower";

export type RegressionMetricDescriptor = {
  id: string;
  mandatory: boolean;
  direction: MetricDirection;
  threshold?: number;
  requireNonRegression?: boolean;
  allowedEvidenceClasses?: EvidenceObservation["evidenceClass"][];
};

export type RegressionMetricInput = {
  baseline: EvidenceObservation<number>;
  candidate: EvidenceObservation<number>;
};

export type RegressionGateCheck = {
  metricId: string;
  status: "PASS" | "FAIL" | "NOT_EVALUABLE";
  baseline: number | null;
  candidate: number | null;
  reason: string;
};

export const PRESS_AGENT_MANDATORY_GATES: readonly RegressionMetricDescriptor[] = [
  { id: "retrievalRecall", mandatory: true, direction: "higher", requireNonRegression: true },
  { id: "citationPrecision", mandatory: true, direction: "higher", threshold: 0.9 },
  { id: "groundedness", mandatory: true, direction: "higher", threshold: 0.9 },
  { id: "unanswerableBehavior", mandatory: true, direction: "higher", requireNonRegression: true },
  { id: "conflictBehavior", mandatory: true, direction: "higher", requireNonRegression: true },
  { id: "toolSelection", mandatory: true, direction: "higher", threshold: 0.9 },
  { id: "schemaCompliance", mandatory: true, direction: "higher", threshold: 0.95 },
  { id: "taskSuccess", mandatory: true, direction: "higher", threshold: 0.85 },
  { id: "citationRetention", mandatory: true, direction: "higher", threshold: 0.8 },
  { id: "claimRetention", mandatory: true, direction: "higher", threshold: 0.8 },
  {
    id: "costMicros",
    mandatory: true,
    direction: "lower",
    requireNonRegression: true,
    allowedEvidenceClasses: ["measured", "synthetic"],
  },
  {
    id: "latencyMs",
    mandatory: true,
    direction: "lower",
    requireNonRegression: true,
    allowedEvidenceClasses: ["measured", "synthetic"],
  },
  { id: "retryRecovery", mandatory: true, direction: "higher", threshold: 0.9 },
  { id: "terminalVerification", mandatory: true, direction: "higher", threshold: 1 },
  { id: "adversarialSuite", mandatory: true, direction: "higher", threshold: 1 },
];

export function evaluateRegressionGate(args: {
  descriptors?: readonly RegressionMetricDescriptor[];
  metrics: Record<string, RegressionMetricInput | undefined>;
  humanReview: "PENDING" | "APPROVED" | "REJECTED";
}) {
  const descriptors = args.descriptors ?? PRESS_AGENT_MANDATORY_GATES;
  const checks: RegressionGateCheck[] = descriptors.map((descriptor) => {
    const metric = args.metrics[descriptor.id];
    if (
      !metric ||
      metric.baseline.value === null ||
      metric.candidate.value === null ||
      metric.baseline.evidenceClass === "missing" ||
      metric.candidate.evidenceClass === "missing"
    ) {
      return {
        metricId: descriptor.id,
        status: "NOT_EVALUABLE" as const,
        baseline: metric?.baseline.value ?? null,
        candidate: metric?.candidate.value ?? null,
        reason: "required observation is missing",
      };
    }
    if (
      descriptor.allowedEvidenceClasses &&
      (!descriptor.allowedEvidenceClasses.includes(metric.baseline.evidenceClass) ||
        !descriptor.allowedEvidenceClasses.includes(metric.candidate.evidenceClass))
    ) {
      return {
        metricId: descriptor.id,
        status: "NOT_EVALUABLE" as const,
        baseline: metric.baseline.value,
        candidate: metric.candidate.value,
        reason: "observation is not independently measured",
      };
    }
    const thresholdPass =
      descriptor.threshold === undefined ||
      (descriptor.direction === "higher"
        ? metric.candidate.value >= descriptor.threshold
        : metric.candidate.value <= descriptor.threshold);
    const regressionPass =
      !descriptor.requireNonRegression ||
      (descriptor.direction === "higher"
        ? metric.candidate.value >= metric.baseline.value
        : metric.candidate.value <= metric.baseline.value);
    return {
      metricId: descriptor.id,
      status: thresholdPass && regressionPass ? "PASS" as const : "FAIL" as const,
      baseline: metric.baseline.value,
      candidate: metric.candidate.value,
      reason:
        thresholdPass && regressionPass
          ? "mandatory gate passed"
          : "mandatory threshold or non-regression rule failed",
    };
  });

  const mandatory = descriptors
    .map((descriptor, index) => ({ descriptor, check: checks[index] }))
    .filter(({ descriptor }) => descriptor.mandatory);
  let disposition: GateDisposition;
  if (
    args.humanReview === "REJECTED" ||
    mandatory.some(({ check }) => check.status === "FAIL")
  ) {
    disposition = "REJECT";
  } else if (
    args.humanReview !== "APPROVED" ||
    mandatory.some(({ check }) => check.status === "NOT_EVALUABLE")
  ) {
    disposition = "NOT_EVALUABLE";
  } else {
    disposition = "PROMOTE";
  }
  return { disposition, checks, deploymentAuthorized: false as const };
}
