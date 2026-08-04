import { percentile } from "./ragMetrics";
import {
  assertIndependentControlledLiveExecutions,
  type ControlledLiveDataset,
  type ControlledLiveExecutionArtifact,
} from "./controlledLiveEvaluation";
import type { JudgeCalibrationArtifact } from "./judgeCalibrationArtifact";

export type ControlledLiveNotEvaluable = Readonly<{
  status: "NOT_EVALUABLE";
  reason:
    | "CLAIM_EVIDENCE_NOT_EMITTED"
    | "CONFLICT_SIGNAL_NOT_EMITTED"
    | "NO_AGENT_CASES"
    | "JUDGE_CALIBRATION_REQUIRED"
    | "JUDGE_CALIBRATION_FAILED";
}>;

type ControlledLiveEvaluableMetric = Readonly<{
  status: "EVALUABLE";
  value: number;
}>;

type ObservableReport = Readonly<{
  executionId: string;
  configurationHash: string;
  retrievalRecallAt5: number | null;
  citationDocumentPrecision: number | null;
  answerabilityAccuracy: number | null;
  agentCompletionRate: number | null;
  claimGroundedness: ControlledLiveNotEvaluable | ControlledLiveEvaluableMetric;
  conflictDetection: ControlledLiveNotEvaluable | ControlledLiveEvaluableMetric;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalCostMicros: number;
  caseRunCount: number;
  stageLatency: Readonly<Record<string, Readonly<{ sampleCount: number; p50Ms: number; p95Ms: number }>>>;
  stageBoundary: "combined-hybrid-sql-retrieval-v1";
  componentCostMicros: Readonly<Record<string, number>>;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code);
  }
  return value as Record<string, unknown>;
}

function logicalDocumentIds(result: unknown, source: "hits" | "citations") {
  const envelope = asRecord(result, "CONTROLLED_LIVE_RESULT_SHAPE_INVALID");
  const product = asRecord(
    envelope.productResult,
    "CONTROLLED_LIVE_PRODUCT_RESULT_MISSING",
  );
  const map = asRecord(
    envelope.documentIdMap,
    "CONTROLLED_LIVE_DOCUMENT_ID_MAP_MISSING",
  );
  const rows = product[source];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (row === null || typeof row !== "object") return [];
    const actual = (row as Record<string, unknown>).documentId;
    if (typeof actual !== "string") return [];
    const logical = map[actual];
    return typeof logical === "string" ? [logical] : [];
  });
}

function cannotAnswer(result: unknown): boolean | null {
  const envelope = asRecord(result, "CONTROLLED_LIVE_RESULT_SHAPE_INVALID");
  const product = asRecord(
    envelope.productResult,
    "CONTROLLED_LIVE_PRODUCT_RESULT_MISSING",
  );
  const output = product.output;
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const value = (output as Record<string, unknown>).cannotAnswer;
  return typeof value === "boolean" ? value : null;
}

function productResult(result: unknown) {
  return asRecord(
    asRecord(result, "CONTROLLED_LIVE_RESULT_SHAPE_INVALID").productResult,
    "CONTROLLED_LIVE_PRODUCT_RESULT_MISSING",
  );
}

function claimStatuses(result: unknown): string[] {
  const output = productResult(result).output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const verification = (output as Record<string, unknown>).claimVerification;
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) return [];
  const claims = (verification as Record<string, unknown>).claims;
  if (!Array.isArray(claims)) return [];
  return claims.flatMap((claim) =>
    claim && typeof claim === "object" && typeof (claim as Record<string, unknown>).status === "string"
      ? [(claim as Record<string, unknown>).status as string]
      : [],
  );
}

function conflictSignal(result: unknown): boolean | null {
  const product = productResult(result);
  if (typeof product.conflictDetected === "boolean") return product.conflictDetected;
  const steps = product.steps;
  if (!Array.isArray(steps)) return null;
  return steps.some((step) => JSON.stringify(step).includes("SOURCE_CONFLICT"));
}

function stageValues(result: unknown): Record<string, number> {
  const envelope = asRecord(result, "CONTROLLED_LIVE_RESULT_SHAPE_INVALID");
  const product = productResult(result);
  const metrics = product.stageMetrics;
  const values: Record<string, number> = {};
  if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
    for (const [name, value] of Object.entries(metrics)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) values[name] = value;
    }
  }
  if (Array.isArray(product.steps)) {
    const agentStageMs = product.steps.reduce((sum, step) => {
      if (!step || typeof step !== "object") return sum;
      const latency = (step as Record<string, unknown>).latencyMs;
      return typeof latency === "number" && Number.isFinite(latency) ? sum + latency : sum;
    }, 0);
    if (agentStageMs > 0) values.agentModelToolVerifierMs = agentStageMs;
  }
  if (Array.isArray(envelope.indexingStageMetrics)) {
    for (const metric of envelope.indexingStageMetrics) {
      if (!metric || typeof metric !== "object" || Array.isArray(metric)) continue;
      for (const [name, value] of Object.entries(metric as Record<string, unknown>)) {
        if (name === "documentId" || typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
        values[`indexing.${name}`] = (values[`indexing.${name}`] ?? 0) + value;
      }
    }
  }
  return values;
}

function componentCosts(result: unknown): Record<string, number> {
  const envelope = asRecord(result, "CONTROLLED_LIVE_RESULT_SHAPE_INVALID");
  const costs: Record<string, number> = {};
  const raw = productResult(result).componentCostMicros;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) costs[name] = value;
    }
  }
  if (Array.isArray(envelope.indexingStageMetrics)) {
    for (const metric of envelope.indexingStageMetrics) {
      if (!metric || typeof metric !== "object" || Array.isArray(metric)) continue;
      for (const [name, value] of Object.entries(metric as Record<string, unknown>)) {
        if (!name.endsWith("CostMicros") || typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
        const component = `indexing.${name}`;
        costs[component] = (costs[component] ?? 0) + value;
      }
    }
  }
  return costs;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function scoreExecution(args: {
  dataset: ControlledLiveDataset;
  artifact: ControlledLiveExecutionArtifact;
  calibration?: JudgeCalibrationArtifact;
}): ObservableReport {
  const caseById = new Map(args.dataset.cases.map((entry) => [entry.id, entry]));
  let retrievalScore = 0;
  let retrievalRunCount = 0;
  let relevantCitationCount = 0;
  let citationCount = 0;
  let answerabilityCorrect = 0;
  let answerabilityCount = 0;
  let completedAgentRunCount = 0;
  let agentRunCount = 0;
  let supportedClaimCount = 0;
  let claimCount = 0;
  let conflictCorrect = 0;
  let conflictCount = 0;
  const stages = new Map<string, number[]>();
  const componentCostMicros: Record<string, number> = {};

  for (const run of args.artifact.results) {
    const entry = caseById.get(run.caseId);
    if (!entry || entry.kind !== run.kind) {
      fail(`CONTROLLED_LIVE_ARTIFACT_CASE_MISMATCH:${run.caseId}`);
    }
    const expected = new Set(entry.expectedDocumentIds);
    const measuredStages = {
      ...stageValues(run.result),
      endToEndMs: run.latencyMs,
    };
    for (const [name, value] of Object.entries(measuredStages)) {
      const samples = stages.get(name) ?? [];
      samples.push(value);
      stages.set(name, samples);
    }
    for (const [name, value] of Object.entries(componentCosts(run.result))) {
      componentCostMicros[name] = (componentCostMicros[name] ?? 0) + value;
    }
    if (run.kind === "RETRIEVAL_ONLY") {
      const retrieved = logicalDocumentIds(run.result, "hits").slice(0, 5);
      const matches = [...expected].filter((id) => retrieved.includes(id)).length;
      retrievalScore += expected.size === 0 ? 0 : matches / expected.size;
      retrievalRunCount += 1;
      continue;
    }

    agentRunCount += 1;
    if (productResult(run.result).status === "COMPLETED") completedAgentRunCount += 1;
    const citations = logicalDocumentIds(run.result, "citations");
    citationCount += citations.length;
    relevantCitationCount += citations.filter((id) => expected.has(id)).length;
    const predictedCannotAnswer = cannotAnswer(run.result);
    if (predictedCannotAnswer !== null) {
      answerabilityCount += 1;
      const expectedCannotAnswer = entry.expectedAnswerability === "ABSTAIN";
      if (predictedCannotAnswer === expectedCannotAnswer) answerabilityCorrect += 1;
    }
    const statuses = claimStatuses(run.result);
    claimCount += statuses.length;
    supportedClaimCount += statuses.filter((status) => status === "SUPPORTED").length;
    const predictedConflict = conflictSignal(run.result);
    if (predictedConflict !== null) {
      conflictCount += 1;
      if (predictedConflict === (entry.expectedConflict !== "NONE")) conflictCorrect += 1;
    }
  }

  const latencies = args.artifact.results.map((run) => run.latencyMs);
  return Object.freeze({
    executionId: args.artifact.executionId,
    configurationHash: args.artifact.configurationHash,
    retrievalRecallAt5: ratio(retrievalScore, retrievalRunCount),
    citationDocumentPrecision: ratio(relevantCitationCount, citationCount),
    answerabilityAccuracy: ratio(answerabilityCorrect, answerabilityCount),
    agentCompletionRate: ratio(completedAgentRunCount, agentRunCount),
    claimGroundedness: Object.freeze(
      claimCount === 0
        ? { status: "NOT_EVALUABLE" as const, reason: "CLAIM_EVIDENCE_NOT_EMITTED" as const }
        : !args.calibration
          ? { status: "NOT_EVALUABLE" as const, reason: "JUDGE_CALIBRATION_REQUIRED" as const }
          : args.calibration.status !== "PASS"
            ? { status: "NOT_EVALUABLE" as const, reason: "JUDGE_CALIBRATION_FAILED" as const }
            : { status: "EVALUABLE" as const, value: supportedClaimCount / claimCount },
    ),
    conflictDetection: Object.freeze(
      conflictCount === 0
        ? { status: "NOT_EVALUABLE" as const, reason: "CONFLICT_SIGNAL_NOT_EMITTED" as const }
        : { status: "EVALUABLE" as const, value: conflictCorrect / conflictCount },
    ),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    totalCostMicros: args.artifact.totalCostMicros,
    caseRunCount: args.artifact.results.length,
    stageLatency: Object.freeze(
      Object.fromEntries(
        [...stages.entries()].map(([name, values]) => [name, Object.freeze({
          sampleCount: values.length,
          p50Ms: percentile(values, 0.5),
          p95Ms: percentile(values, 0.95),
        })]),
      ),
    ),
    stageBoundary: "combined-hybrid-sql-retrieval-v1" as const,
    componentCostMicros: Object.freeze(componentCostMicros),
  });
}

function numericDelta(candidate: number | null, baseline: number | null) {
  return candidate === null || baseline === null ? null : candidate - baseline;
}

export function buildControlledLiveComparisonReport(args: {
  dataset: ControlledLiveDataset;
  baseline: ControlledLiveExecutionArtifact;
  candidate: ControlledLiveExecutionArtifact;
  calibration?: JudgeCalibrationArtifact;
}) {
  assertIndependentControlledLiveExecutions(args.baseline, args.candidate);
  const baseline = scoreExecution({ dataset: args.dataset, artifact: args.baseline, calibration: args.calibration });
  const candidate = scoreExecution({ dataset: args.dataset, artifact: args.candidate, calibration: args.calibration });
  return Object.freeze({
    version: "press-rag-controlled-live-comparison/v1" as const,
    datasetHash: args.baseline.datasetHash,
    provenance: Object.freeze({
      executorId: "press-agent-controlled-live/v1" as const,
      baseline: Object.freeze({
        executionId: args.baseline.executionId,
        datasetHash: args.baseline.datasetHash,
        configurationHash: args.baseline.configurationHash,
        caseRunIds: Object.freeze(args.baseline.results.map(({ caseRunId }) => caseRunId)),
        startedAt: args.baseline.startedAt,
        completedAt: args.baseline.completedAt,
      }),
      candidate: Object.freeze({
        executionId: args.candidate.executionId,
        datasetHash: args.candidate.datasetHash,
        configurationHash: args.candidate.configurationHash,
        caseRunIds: Object.freeze(args.candidate.results.map(({ caseRunId }) => caseRunId)),
        startedAt: args.candidate.startedAt,
        completedAt: args.candidate.completedAt,
      }),
    }),
    baseline,
    candidate,
    delta: Object.freeze({
      retrievalRecallAt5: numericDelta(
        candidate.retrievalRecallAt5,
        baseline.retrievalRecallAt5,
      ),
      citationDocumentPrecision: numericDelta(
        candidate.citationDocumentPrecision,
        baseline.citationDocumentPrecision,
      ),
      answerabilityAccuracy: numericDelta(
        candidate.answerabilityAccuracy,
        baseline.answerabilityAccuracy,
      ),
      agentCompletionRate: numericDelta(
        candidate.agentCompletionRate,
        baseline.agentCompletionRate,
      ),
      p95LatencyMs: candidate.p95LatencyMs - baseline.p95LatencyMs,
      totalCostMicros: candidate.totalCostMicros - baseline.totalCostMicros,
    }),
  });
}
