import { z } from "zod";

import {
  parsePressRagResultArtifact,
  type PressRagFixtures,
  type PressRagMeasuredResult,
  type PressRagResultArtifact,
} from "./pressRagEvaluation";
import { calculateRagMetrics, type RagEvaluationResult } from "./ragMetrics";

export const AGENT_IMPROVEMENT_CYCLE_VERSION =
  "agent-improvement-cycle/v1" as const;

const LIFECYCLE_STAGES = [
  "observe",
  "triage",
  "promote",
  "experiment",
  "gate",
  "human_review",
] as const;

const finiteNumber = z.number().finite();
const nonNegativeInteger = z.number().int().nonnegative();
const nonEmptyString = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });

const countRateSchema = z
  .object({
    numerator: nonNegativeInteger,
    denominator: z.number().int().positive(),
    rate: finiteNumber.min(0).max(1),
  })
  .strict();

const signalSchema = z
  .object({
    id: nonEmptyString,
    category: z.enum(["unsupported_citation", "ungrounded_claim"]),
    caseId: nonEmptyString,
    failingItemIndexes: z.array(nonNegativeInteger).min(1),
    citationDocumentIds: z.array(nonEmptyString),
    sourceArtifactPath: nonEmptyString,
    metricName: z.enum(["citation_precision", "grounded_claim_rate"]),
    baseline: z
      .object({
        numerator: nonNegativeInteger,
        denominator: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

const candidateSchema = z
  .object({
    id: nonEmptyString,
    caseId: nonEmptyString,
    sourceSignalIds: z.array(nonEmptyString).min(1),
    expectedChecks: z
      .array(
        z.enum([
          "all_emitted_citations_supported",
          "all_emitted_claims_grounded",
        ]),
      )
      .min(1),
  })
  .strict();

const comparisonSchema = z
  .object({
    citationPrecision: z
      .object({
        baseline: countRateSchema,
        candidate: countRateSchema,
        delta: finiteNumber,
      })
      .strict(),
    groundedClaimRate: z
      .object({
        baseline: countRateSchema,
        candidate: countRateSchema,
        delta: finiteNumber,
      })
      .strict(),
    citationRetention: z
      .object({
        retained: nonNegativeInteger,
        baseline: z.number().int().positive(),
        rate: finiteNumber.min(0).max(1),
      })
      .strict(),
    claimRetention: z
      .object({
        retained: nonNegativeInteger,
        baseline: z.number().int().positive(),
        rate: finiteNumber.min(0).max(1),
      })
      .strict(),
    tradeOffs: z
      .object({
        removedCitations: nonNegativeInteger,
        removedClaims: nonNegativeInteger,
      })
      .strict(),
    cost: z
      .object({
        baselineMicros: finiteNumber.nonnegative(),
        candidateMicros: finiteNumber.nonnegative(),
        deltaMicros: finiteNumber,
        increaseRate: finiteNumber,
        candidateEvidence: z.enum([
          "reused_baseline",
          "independently_measured",
        ]),
      })
      .strict(),
  })
  .strict();

const gatePolicySchema = z
  .object({
    version: z.literal("controlled-replay-demo-policy/v1"),
    classification: z.literal("demo_policy"),
    minimumCitationPrecisionDelta: finiteNumber,
    minimumGroundedClaimRateDelta: finiteNumber,
    minimumCitationRetention: finiteNumber.min(0).max(1),
    minimumClaimRetention: finiteNumber.min(0).max(1),
    maximumIndependentlyMeasuredCostIncrease: finiteNumber,
  })
  .strict();

const gateCheckSchema = z
  .object({
    check: z.enum([
      "citation_quality",
      "grounding_quality",
      "citation_retention",
      "claim_retention",
      "cost_increase",
    ]),
    status: z.enum(["PASS", "FAIL", "NOT_EVALUABLE"]),
    observed: finiteNumber.nullable(),
    threshold: finiteNumber,
    reason: nonEmptyString,
  })
  .strict();

const gateSchema = z
  .object({
    policyVersion: z.literal("controlled-replay-demo-policy/v1"),
    checks: z.array(gateCheckSchema).length(5),
    automatedDisposition: z.enum(["PASS", "REVIEW_REQUIRED"]),
    deploymentAuthorized: z.literal(false),
  })
  .strict();

const pendingReviewSchema = z
  .object({
    state: z.literal("PENDING"),
    reviewer: z.null(),
    decision: z.null(),
    decidedAt: z.null(),
    notes: z.null(),
  })
  .strict();

const approvedReviewSchema = z
  .object({
    state: z.literal("APPROVED"),
    reviewer: nonEmptyString,
    decision: z.literal("APPROVE"),
    decidedAt: timestamp,
    notes: z.string().nullable(),
  })
  .strict();

const rejectedReviewSchema = z
  .object({
    state: z.literal("REJECTED"),
    reviewer: nonEmptyString,
    decision: z.literal("REJECT"),
    decidedAt: timestamp,
    notes: z.string().nullable(),
  })
  .strict();

const artifactSchema = z
  .object({
    version: z.literal(AGENT_IMPROVEMENT_CYCLE_VERSION),
    cycleId: nonEmptyString,
    cycleKind: z.literal("controlled_replay"),
    generatedAt: timestamp,
    source: z
      .object({
        datasetPath: nonEmptyString,
        corpusPath: nonEmptyString,
        resultPath: nonEmptyString,
        datasetVersion: nonEmptyString,
        corpusVersion: nonEmptyString,
        historicalCollectedAt: timestamp,
        evidenceClassification: z.literal(
          "historical_controlled_evaluation",
        ),
      })
      .strict(),
    lifecycle: z
      .array(
        z
          .object({
            stage: z.enum(LIFECYCLE_STAGES),
            occurredAt: timestamp,
          })
          .strict(),
      )
      .length(LIFECYCLE_STAGES.length),
    configurations: z
      .object({
        baseline: z
          .object({
            id: nonEmptyString,
            model: nonEmptyString.nullable(),
            judgeModel: nonEmptyString.nullable(),
            promptVersion: nonEmptyString.nullable(),
            retrievalVersion: nonEmptyString.nullable(),
            toolsetVersion: nonEmptyString.nullable(),
            configVersion: nonEmptyString.nullable(),
            evidenceClassification: z.literal("historically_measured"),
          })
          .strict(),
        candidate: z
          .object({
            id: nonEmptyString,
            basedOnConfigurationId: nonEmptyString,
            transformation: z.literal(
              "filter_unsupported_citations_and_ungrounded_claims",
            ),
            evidenceClassification: z.literal("replay_derived"),
            retrievalRerun: z.literal(false),
            generationRerun: z.literal(false),
          })
          .strict(),
      })
      .strict(),
    signals: z.array(signalSchema),
    regressionCandidates: z.array(candidateSchema),
    comparison: comparisonSchema,
    gatePolicy: gatePolicySchema,
    gate: gateSchema,
    humanReview: z.discriminatedUnion("state", [
      pendingReviewSchema,
      approvedReviewSchema,
      rejectedReviewSchema,
    ]),
    deploymentAuthorized: z.literal(false),
  })
  .strict();

export type ImprovementSignal = z.infer<typeof signalSchema>;
export type RegressionCandidate = z.infer<typeof candidateSchema>;
export type ImprovementExperimentComparison = z.infer<
  typeof comparisonSchema
>;
export type ImprovementGatePolicy = z.infer<typeof gatePolicySchema>;
export type ImprovementReleaseGate = z.infer<typeof gateSchema>;
export type AgentImprovementCycleArtifact = z.infer<typeof artifactSchema>;

export const CONTROLLED_REPLAY_GATE_POLICY: ImprovementGatePolicy = {
  version: "controlled-replay-demo-policy/v1",
  classification: "demo_policy",
  minimumCitationPrecisionDelta: 0,
  minimumGroundedClaimRateDelta: 0,
  minimumCitationRetention: 0.8,
  minimumClaimRetention: 0.8,
  maximumIndependentlyMeasuredCostIncrease: 0.1,
};

function fail(code: string): never {
  throw new Error(code);
}

function firstDuplicate(values: readonly string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function close(left: number, right: number) {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 4;
}

function validateCountRate(
  value: z.infer<typeof countRateSchema>,
  name: string,
) {
  if (value.numerator > value.denominator) {
    fail(`AGENT_IMPROVEMENT_CYCLE_INVALID_COUNT:${name}`);
  }
  if (!close(value.rate, value.numerator / value.denominator)) {
    fail(`AGENT_IMPROVEMENT_CYCLE_INCONSISTENT_RATE:${name}`);
  }
}

export function parseAgentImprovementCycleArtifact(
  input: unknown,
): AgentImprovementCycleArtifact {
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) fail("AGENT_IMPROVEMENT_CYCLE_INVALID_ARTIFACT");
  const artifact = parsed.data;

  for (let index = 0; index < LIFECYCLE_STAGES.length; index += 1) {
    if (artifact.lifecycle[index].stage !== LIFECYCLE_STAGES[index]) {
      fail("AGENT_IMPROVEMENT_CYCLE_INVALID_STAGE_ORDER");
    }
    if (
      index > 0 &&
      Date.parse(artifact.lifecycle[index].occurredAt) <=
        Date.parse(artifact.lifecycle[index - 1].occurredAt)
    ) {
      fail("AGENT_IMPROVEMENT_CYCLE_INVALID_STAGE_TIMESTAMPS");
    }
  }

  const duplicateSignal = firstDuplicate(artifact.signals.map(({ id }) => id));
  if (duplicateSignal) {
    fail(`AGENT_IMPROVEMENT_CYCLE_DUPLICATE_SIGNAL:${duplicateSignal}`);
  }
  const duplicateCandidate = firstDuplicate(
    artifact.regressionCandidates.map(({ id }) => id),
  );
  if (duplicateCandidate) {
    fail(`AGENT_IMPROVEMENT_CYCLE_DUPLICATE_CANDIDATE:${duplicateCandidate}`);
  }
  const signalById = new Map(artifact.signals.map((signal) => [signal.id, signal]));
  for (const signal of artifact.signals) {
    if (firstDuplicate(signal.failingItemIndexes.map(String))) {
      fail(`AGENT_IMPROVEMENT_CYCLE_DUPLICATE_ITEM_INDEX:${signal.id}`);
    }
    if (signal.category === "unsupported_citation") {
      if (
        signal.metricName !== "citation_precision" ||
        signal.citationDocumentIds.length !== signal.failingItemIndexes.length
      ) {
        fail(`AGENT_IMPROVEMENT_CYCLE_INVALID_CITATION_SIGNAL:${signal.id}`);
      }
    } else if (
      signal.metricName !== "grounded_claim_rate" ||
      signal.citationDocumentIds.length !== 0
    ) {
      fail(`AGENT_IMPROVEMENT_CYCLE_INVALID_CLAIM_SIGNAL:${signal.id}`);
    }
    if (
      signal.sourceArtifactPath !== artifact.source.resultPath ||
      signal.baseline.numerator !==
        signal.baseline.denominator - signal.failingItemIndexes.length ||
      signal.failingItemIndexes.some(
        (index) => index >= signal.baseline.denominator,
      )
    ) {
      fail(`AGENT_IMPROVEMENT_CYCLE_INCONSISTENT_SIGNAL:${signal.id}`);
    }
  }
  const duplicateCandidateCase = firstDuplicate(
    artifact.regressionCandidates.map(({ caseId }) => caseId),
  );
  if (duplicateCandidateCase) {
    fail(
      `AGENT_IMPROVEMENT_CYCLE_DUPLICATE_CANDIDATE_CASE:${duplicateCandidateCase}`,
    );
  }
  const referencedSignalIds: string[] = [];
  for (const candidate of artifact.regressionCandidates) {
    if (firstDuplicate(candidate.sourceSignalIds)) {
      fail(`AGENT_IMPROVEMENT_CYCLE_DUPLICATE_SIGNAL_REFERENCE:${candidate.id}`);
    }
    for (const signalId of candidate.sourceSignalIds) {
      const signal = signalById.get(signalId);
      if (!signal) {
        fail(`AGENT_IMPROVEMENT_CYCLE_UNKNOWN_SIGNAL:${signalId}`);
      }
      if (signal.caseId !== candidate.caseId) {
        fail(`AGENT_IMPROVEMENT_CYCLE_SIGNAL_CASE_MISMATCH:${candidate.id}`);
      }
      referencedSignalIds.push(signalId);
    }
    const candidateSignals = candidate.sourceSignalIds.map(
      (signalId) => signalById.get(signalId)!,
    );
    const expectedChecks = candidateSignals.map(({ category }) =>
      category === "unsupported_citation"
        ? "all_emitted_citations_supported"
        : "all_emitted_claims_grounded",
    );
    if (JSON.stringify(candidate.expectedChecks) !== JSON.stringify(expectedChecks)) {
      fail(`AGENT_IMPROVEMENT_CYCLE_CANDIDATE_CHECK_MISMATCH:${candidate.id}`);
    }
  }
  if (
    referencedSignalIds.length !== artifact.signals.length ||
    new Set(referencedSignalIds).size !== artifact.signals.length
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_SIGNALS_MUST_BE_PROMOTED_ONCE");
  }
  if (
    artifact.configurations.candidate.basedOnConfigurationId !==
    artifact.configurations.baseline.id
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_CONFIGURATION_REFERENCE_MISMATCH");
  }

  const comparison = artifact.comparison;
  validateCountRate(comparison.citationPrecision.baseline, "citation_baseline");
  validateCountRate(comparison.citationPrecision.candidate, "citation_candidate");
  validateCountRate(comparison.groundedClaimRate.baseline, "claim_baseline");
  validateCountRate(comparison.groundedClaimRate.candidate, "claim_candidate");
  if (
    !close(
      comparison.citationPrecision.delta,
      comparison.citationPrecision.candidate.rate -
        comparison.citationPrecision.baseline.rate,
    ) ||
    !close(
      comparison.groundedClaimRate.delta,
      comparison.groundedClaimRate.candidate.rate -
        comparison.groundedClaimRate.baseline.rate,
    )
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_INCONSISTENT_DELTA");
  }
  if (
    comparison.citationRetention.baseline !==
      comparison.citationPrecision.baseline.denominator ||
    comparison.citationRetention.retained !==
      comparison.citationPrecision.candidate.denominator ||
    !close(
      comparison.citationRetention.rate,
      comparison.citationRetention.retained /
        comparison.citationRetention.baseline,
    ) ||
    comparison.claimRetention.baseline !==
      comparison.groundedClaimRate.baseline.denominator ||
    comparison.claimRetention.retained !==
      comparison.groundedClaimRate.candidate.denominator ||
    !close(
      comparison.claimRetention.rate,
      comparison.claimRetention.retained / comparison.claimRetention.baseline,
    )
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_INCONSISTENT_RETENTION");
  }
  if (
    comparison.tradeOffs.removedCitations !==
      comparison.citationRetention.baseline -
        comparison.citationRetention.retained ||
    comparison.tradeOffs.removedClaims !==
      comparison.claimRetention.baseline - comparison.claimRetention.retained
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_INCONSISTENT_TRADE_OFFS");
  }
  const expectedCostDelta =
    comparison.cost.candidateMicros - comparison.cost.baselineMicros;
  const expectedIncrease =
    comparison.cost.baselineMicros === 0
      ? comparison.cost.candidateMicros === 0
        ? 0
        : Number.POSITIVE_INFINITY
      : expectedCostDelta / comparison.cost.baselineMicros;
  if (
    !close(comparison.cost.deltaMicros, expectedCostDelta) ||
    !Number.isFinite(expectedIncrease) ||
    !close(comparison.cost.increaseRate, expectedIncrease)
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_INCONSISTENT_COST");
  }
  if (
    comparison.cost.candidateEvidence === "reused_baseline" &&
    (comparison.cost.candidateMicros !== comparison.cost.baselineMicros ||
      comparison.cost.deltaMicros !== 0 ||
      comparison.cost.increaseRate !== 0)
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_REUSED_COST_MUST_MATCH_BASELINE");
  }

  if (
    JSON.stringify(artifact.gatePolicy) !==
    JSON.stringify(CONTROLLED_REPLAY_GATE_POLICY)
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_POLICY_VERSION_CONTRADICTION");
  }

  const expectedGate = evaluateImprovementReleaseGate(
    comparison,
    artifact.gatePolicy,
  );
  if (JSON.stringify(expectedGate) !== JSON.stringify(artifact.gate)) {
    fail("AGENT_IMPROVEMENT_CYCLE_GATE_CONTRADICTION");
  }
  if (
    artifact.humanReview.state === "PENDING" &&
    artifact.deploymentAuthorized
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_PENDING_REVIEW_CANNOT_DEPLOY");
  }
  if (
    Date.parse(artifact.generatedAt) <
    Date.parse(artifact.lifecycle[artifact.lifecycle.length - 1].occurredAt)
  ) {
    fail("AGENT_IMPROVEMENT_CYCLE_GENERATED_BEFORE_LIFECYCLE_COMPLETED");
  }
  return artifact;
}

const categoryOrder = {
  unsupported_citation: 0,
  ungrounded_claim: 1,
} as const;

export function deriveImprovementSignals(input: {
  results: readonly PressRagMeasuredResult[];
  sourceArtifactPath: string;
}): ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const result of input.results) {
    const unsupportedIndexes = result.citations
      .map((citation, index) => (citation.supported ? -1 : index))
      .filter((index) => index >= 0);
    if (unsupportedIndexes.length) {
      signals.push({
        id: `signal:${result.caseId}:unsupported-citation`,
        category: "unsupported_citation",
        caseId: result.caseId,
        failingItemIndexes: unsupportedIndexes,
        citationDocumentIds: unsupportedIndexes.map(
          (index) => result.citations[index].documentId,
        ),
        sourceArtifactPath: input.sourceArtifactPath,
        metricName: "citation_precision",
        baseline: {
          numerator: result.citations.length - unsupportedIndexes.length,
          denominator: result.citations.length,
        },
      });
    }
    const ungroundedIndexes = result.claims
      .map((claim, index) => (claim.grounded ? -1 : index))
      .filter((index) => index >= 0);
    if (ungroundedIndexes.length) {
      signals.push({
        id: `signal:${result.caseId}:ungrounded-claim`,
        category: "ungrounded_claim",
        caseId: result.caseId,
        failingItemIndexes: ungroundedIndexes,
        citationDocumentIds: [],
        sourceArtifactPath: input.sourceArtifactPath,
        metricName: "grounded_claim_rate",
        baseline: {
          numerator: result.claims.length - ungroundedIndexes.length,
          denominator: result.claims.length,
        },
      });
    }
  }
  return signals.sort(
    (left, right) =>
      left.caseId.localeCompare(right.caseId) ||
      categoryOrder[left.category] - categoryOrder[right.category],
  );
}

export function promoteRegressionCandidates(
  signals: readonly ImprovementSignal[],
): RegressionCandidate[] {
  const byCase = new Map<string, ImprovementSignal[]>();
  for (const signal of signals) {
    const current = byCase.get(signal.caseId) ?? [];
    current.push(signal);
    byCase.set(signal.caseId, current);
  }
  return [...byCase.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([caseId, caseSignals]) => {
      const ordered = [...caseSignals].sort(
        (left, right) =>
          categoryOrder[left.category] - categoryOrder[right.category],
      );
      return {
        id: `regression:${caseId}`,
        caseId,
        sourceSignalIds: ordered.map(({ id }) => id),
        expectedChecks: ordered.map(({ category }) =>
          category === "unsupported_citation"
            ? ("all_emitted_citations_supported" as const)
            : ("all_emitted_claims_grounded" as const),
        ),
      };
    });
}

export function buildControlledReplayCandidate(
  results: readonly PressRagMeasuredResult[],
): PressRagMeasuredResult[] {
  return results.map((result) => ({
    ...structuredClone(result),
    citations: result.citations
      .filter(({ supported }) => supported)
      .map((citation) => ({ ...citation })),
    claims: result.claims
      .filter(({ grounded }) => grounded)
      .map((claim) => ({ ...claim })),
  }));
}

function toMetricResults(
  fixtures: PressRagFixtures,
  results: readonly PressRagMeasuredResult[],
): RagEvaluationResult[] {
  const expectedById = new Map(
    fixtures.dataset.cases.map((entry) => [entry.id, entry]),
  );
  return results.map((result) => {
    const expected = expectedById.get(result.caseId);
    if (!expected) fail(`AGENT_IMPROVEMENT_CYCLE_UNKNOWN_CASE:${result.caseId}`);
    return {
      caseId: result.caseId,
      expectedDocumentIds: expected.expectedDocumentIds,
      retrievedDocumentIds: result.retrievedDocumentIds,
      citations: result.citations,
      claims: result.claims,
      expectedUnanswerable: expected.expectedUnanswerable,
      predictedUnanswerable: result.predictedUnanswerable,
      expectedConflict: expected.expectedConflict,
      detectedConflict: result.detectedConflict,
      latencyMs: result.latencyMs,
      costMicros: result.costMicros,
    };
  });
}

function rate(numerator: number, denominator: number) {
  if (denominator === 0) fail("AGENT_IMPROVEMENT_CYCLE_EMPTY_METRIC");
  return numerator / denominator;
}

export function compareImprovementExperiments(input: {
  fixtures: PressRagFixtures;
  baseline: readonly PressRagMeasuredResult[];
  candidate: readonly PressRagMeasuredResult[];
  candidateCostProvenance: "reused_baseline" | "independently_measured";
}): ImprovementExperimentComparison {
  const baseline = calculateRagMetrics(
    toMetricResults(input.fixtures, input.baseline),
  );
  const candidate = calculateRagMetrics(
    toMetricResults(input.fixtures, input.candidate),
  );
  const baselineCitationRate = rate(
    baseline.supportedCitationCount,
    baseline.citationCount,
  );
  const candidateCitationRate = rate(
    candidate.supportedCitationCount,
    candidate.citationCount,
  );
  const baselineClaimRate = rate(
    baseline.groundedClaimCount,
    baseline.claimCount,
  );
  const candidateClaimRate = rate(
    candidate.groundedClaimCount,
    candidate.claimCount,
  );
  const costDelta = candidate.totalCostMicros - baseline.totalCostMicros;
  return {
    citationPrecision: {
      baseline: {
        numerator: baseline.supportedCitationCount,
        denominator: baseline.citationCount,
        rate: baselineCitationRate,
      },
      candidate: {
        numerator: candidate.supportedCitationCount,
        denominator: candidate.citationCount,
        rate: candidateCitationRate,
      },
      delta: candidateCitationRate - baselineCitationRate,
    },
    groundedClaimRate: {
      baseline: {
        numerator: baseline.groundedClaimCount,
        denominator: baseline.claimCount,
        rate: baselineClaimRate,
      },
      candidate: {
        numerator: candidate.groundedClaimCount,
        denominator: candidate.claimCount,
        rate: candidateClaimRate,
      },
      delta: candidateClaimRate - baselineClaimRate,
    },
    citationRetention: {
      retained: candidate.citationCount,
      baseline: baseline.citationCount,
      rate: candidate.citationCount / baseline.citationCount,
    },
    claimRetention: {
      retained: candidate.claimCount,
      baseline: baseline.claimCount,
      rate: candidate.claimCount / baseline.claimCount,
    },
    tradeOffs: {
      removedCitations: baseline.citationCount - candidate.citationCount,
      removedClaims: baseline.claimCount - candidate.claimCount,
    },
    cost: {
      baselineMicros: baseline.totalCostMicros,
      candidateMicros: candidate.totalCostMicros,
      deltaMicros: costDelta,
      increaseRate:
        baseline.totalCostMicros === 0
          ? 0
          : costDelta / baseline.totalCostMicros,
      candidateEvidence: input.candidateCostProvenance,
    },
  };
}

export function evaluateImprovementReleaseGate(
  comparison: ImprovementExperimentComparison,
  policy: ImprovementGatePolicy = CONTROLLED_REPLAY_GATE_POLICY,
): ImprovementReleaseGate {
  const checks: ImprovementReleaseGate["checks"] = [
    {
      check: "citation_quality",
      status:
        comparison.citationPrecision.delta >=
        policy.minimumCitationPrecisionDelta
          ? "PASS"
          : "FAIL",
      observed: comparison.citationPrecision.delta,
      threshold: policy.minimumCitationPrecisionDelta,
      reason: "Candidate citation-precision delta versus baseline.",
    },
    {
      check: "grounding_quality",
      status:
        comparison.groundedClaimRate.delta >=
        policy.minimumGroundedClaimRateDelta
          ? "PASS"
          : "FAIL",
      observed: comparison.groundedClaimRate.delta,
      threshold: policy.minimumGroundedClaimRateDelta,
      reason: "Candidate grounded-claim-rate delta versus baseline.",
    },
    {
      check: "citation_retention",
      status:
        comparison.citationRetention.rate >= policy.minimumCitationRetention
          ? "PASS"
          : "FAIL",
      observed: comparison.citationRetention.rate,
      threshold: policy.minimumCitationRetention,
      reason: "Candidate must retain enough emitted citations.",
    },
    {
      check: "claim_retention",
      status:
        comparison.claimRetention.rate >= policy.minimumClaimRetention
          ? "PASS"
          : "FAIL",
      observed: comparison.claimRetention.rate,
      threshold: policy.minimumClaimRetention,
      reason: "Candidate must retain enough emitted claims.",
    },
    {
      check: "cost_increase",
      status:
        comparison.cost.candidateEvidence === "independently_measured"
          ? comparison.cost.increaseRate <=
            policy.maximumIndependentlyMeasuredCostIncrease
            ? "PASS"
            : "FAIL"
          : "NOT_EVALUABLE",
      observed:
        comparison.cost.candidateEvidence === "independently_measured"
          ? comparison.cost.increaseRate
          : null,
      threshold: policy.maximumIndependentlyMeasuredCostIncrease,
      reason:
        comparison.cost.candidateEvidence === "independently_measured"
          ? "Candidate cost was independently measured."
          : "Replay reuses historical baseline cost; candidate cost was not independently measured.",
    },
  ];
  return {
    policyVersion: policy.version,
    checks,
    automatedDisposition: checks.every(({ status }) => status === "PASS")
      ? "PASS"
      : "REVIEW_REQUIRED",
    deploymentAuthorized: false,
  };
}

const REPLAY_EPOCH_MS = Date.parse("2026-08-03T00:00:00.000Z");

export function buildControlledReplayImprovementCycle(input: {
  fixtures: PressRagFixtures;
  artifact: PressRagResultArtifact;
  sourcePaths: { dataset: string; corpus: string; result: string };
}): AgentImprovementCycleArtifact {
  const artifact = parsePressRagResultArtifact(input.artifact, input.fixtures);
  if (!artifact.collectedAt) {
    fail("AGENT_IMPROVEMENT_CYCLE_HISTORICAL_TIMESTAMP_REQUIRED");
  }
  if (!z.string().datetime({ offset: true }).safeParse(artifact.collectedAt).success) {
    fail("AGENT_IMPROVEMENT_CYCLE_INVALID_HISTORICAL_TIMESTAMP");
  }
  const signals = deriveImprovementSignals({
    results: artifact.results,
    sourceArtifactPath: input.sourcePaths.result,
  });
  const regressionCandidates = promoteRegressionCandidates(signals);
  const candidate = buildControlledReplayCandidate(artifact.results);
  const comparison = compareImprovementExperiments({
    fixtures: input.fixtures,
    baseline: artifact.results,
    candidate,
    candidateCostProvenance: "reused_baseline",
  });
  const gatePolicy = structuredClone(CONTROLLED_REPLAY_GATE_POLICY);
  const gate = evaluateImprovementReleaseGate(comparison, gatePolicy);
  const baselineConfigurationId =
    "press-rag-v1-historical-2026-07-23";

  return parseAgentImprovementCycleArtifact({
    version: AGENT_IMPROVEMENT_CYCLE_VERSION,
    cycleId: "press-rag-v1-controlled-replay-2026-08-03",
    cycleKind: "controlled_replay",
    generatedAt: new Date(REPLAY_EPOCH_MS + 6_000).toISOString(),
    source: {
      datasetPath: input.sourcePaths.dataset,
      corpusPath: input.sourcePaths.corpus,
      resultPath: input.sourcePaths.result,
      datasetVersion: input.fixtures.dataset.version,
      corpusVersion: input.fixtures.corpus.version,
      historicalCollectedAt: artifact.collectedAt,
      evidenceClassification: "historical_controlled_evaluation",
    },
    lifecycle: LIFECYCLE_STAGES.map((stage, index) => ({
      stage,
      occurredAt: new Date(REPLAY_EPOCH_MS + index * 1_000).toISOString(),
    })),
    configurations: {
      baseline: {
        id: baselineConfigurationId,
        model: artifact.model ?? null,
        judgeModel: artifact.judgeModel ?? null,
        promptVersion: artifact.promptVersion ?? null,
        retrievalVersion: artifact.retrievalVersion ?? null,
        toolsetVersion: artifact.toolsetVersion ?? null,
        configVersion: artifact.configVersion ?? null,
        evidenceClassification: "historically_measured",
      },
      candidate: {
        id: "press-rag-v1-controlled-filter-v1",
        basedOnConfigurationId: baselineConfigurationId,
        transformation:
          "filter_unsupported_citations_and_ungrounded_claims",
        evidenceClassification: "replay_derived",
        retrievalRerun: false,
        generationRerun: false,
      },
    },
    signals,
    regressionCandidates,
    comparison,
    gatePolicy,
    gate,
    humanReview: {
      state: "PENDING",
      reviewer: null,
      decision: null,
      decidedAt: null,
      notes: null,
    },
    deploymentAuthorized: false,
  });
}
