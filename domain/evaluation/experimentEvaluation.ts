import type {
  AgentExperimentArtifact,
  EvidenceObservation,
} from "./experimentContracts";
import {
  evaluateRegressionGate,
  PRESS_AGENT_MANDATORY_GATES,
  type RegressionMetricInput,
} from "./regressionGate";

const OBSERVATION_KEYS: Record<string, string> = {
  retrievalRecall: "recallAtK",
  citationPrecision: "citationPrecision",
  groundedness: "groundedness",
  unanswerableBehavior: "unanswerableBehavior",
  conflictBehavior: "conflictBehavior",
  toolSelection: "toolSelection",
  schemaCompliance: "schemaCompliance",
  taskSuccess: "taskSuccess",
  citationRetention: "citationRetention",
  claimRetention: "claimRetention",
  costMicros: "costMicros",
  latencyMs: "latencyMs",
  retryRecovery: "retryRecovery",
  terminalVerification: "terminalVerification",
  adversarialSuite: "adversarialSuite",
};

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function aggregate(
  artifact: AgentExperimentArtifact,
  role: "baseline" | "candidate",
  observationKey: string,
): EvidenceObservation<number> {
  const observations = artifact.executions[role].outcomes
    .map(({ observations: values }) => values[observationKey])
    .filter((value): value is EvidenceObservation => Boolean(value));
  const usable = observations
    .map((observation) => ({
      evidenceClass: observation.evidenceClass,
      value: numericValue(observation.value),
    }))
    .filter(
      (observation): observation is { evidenceClass: Exclude<EvidenceObservation["evidenceClass"], "missing">; value: number } =>
        observation.evidenceClass !== "missing" && observation.value !== null,
    );
  if (usable.length !== artifact.executions[role].outcomes.length) {
    return { evidenceClass: "missing", value: null };
  }
  const classes = new Set(usable.map(({ evidenceClass }) => evidenceClass));
  if (classes.size !== 1) return { evidenceClass: "missing", value: null };
  return {
    evidenceClass: usable[0].evidenceClass,
    value: usable.reduce((sum, observation) => sum + observation.value, 0) /
      usable.length,
  };
}

export function evaluateAgentExperiment(
  artifact: AgentExperimentArtifact,
  humanReview: "PENDING" | "APPROVED" | "REJECTED" = "PENDING",
) {
  const metrics: Record<string, RegressionMetricInput> = {};
  for (const descriptor of PRESS_AGENT_MANDATORY_GATES) {
    const observationKey = OBSERVATION_KEYS[descriptor.id];
    metrics[descriptor.id] = {
      baseline: aggregate(artifact, "baseline", observationKey),
      candidate: aggregate(artifact, "candidate", observationKey),
    };
  }
  const evidenceClasses = new Set(
    Object.values(metrics).flatMap(({ baseline, candidate }) => [
      baseline.evidenceClass,
      candidate.evidenceClass,
    ]),
  );
  const evidenceClass = evidenceClasses.has("missing")
    ? "missing"
    : evidenceClasses.size === 1
      ? [...evidenceClasses][0]
      : "mixed";
  return {
    metrics,
    evidenceClass,
    ...evaluateRegressionGate({ metrics, humanReview }),
  };
}
