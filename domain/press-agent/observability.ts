type NullableDate = Date | null;

type KnowledgeDocumentSample = {
  status: string;
  queuedAt: NullableDate;
  processingStartedAt: NullableDate;
  indexedAt: NullableDate;
};

type AgentRunSample = {
  status: string;
  latencyMs: number | null;
  retryCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  estimatedCostMicros: number;
};

type AgentStepSample = {
  kind: string;
  latencyMs: number | null;
};

type AgentApprovalSample = {
  requestedAt: Date;
  decidedAt: NullableDate;
};

type Distribution = {
  sampleCount: number;
  p50: number | null;
  p95: number | null;
};

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function distribution(values: readonly number[]): Distribution {
  return {
    sampleCount: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function elapsedMs(start: NullableDate, end: NullableDate): number | null {
  if (!start || !end) return null;
  const duration = end.getTime() - start.getTime();
  return duration >= 0 ? duration : null;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculatePressAgentObservability(input: {
  documents: readonly KnowledgeDocumentSample[];
  runs: readonly AgentRunSample[];
  steps: readonly AgentStepSample[];
  approvals: readonly AgentApprovalSample[];
}) {
  const terminalDocuments = input.documents.filter((document) =>
    ["READY", "FAILED"].includes(document.status),
  );
  const queueLatencies = input.documents
    .map((document) => elapsedMs(document.queuedAt, document.processingStartedAt))
    .filter((value): value is number => value !== null);
  const indexingLatencies = input.documents
    .map((document) => elapsedMs(document.processingStartedAt, document.indexedAt))
    .filter((value): value is number => value !== null);

  const terminalRuns = input.runs.filter((run) =>
    ["COMPLETED", "FAILED", "CANCELED"].includes(run.status),
  );
  const runLatencies = terminalRuns
    .map((run) => run.latencyMs)
    .filter((value): value is number => value !== null);
  const toolLatencies = input.steps
    .filter((step) => step.kind === "TOOL")
    .map((step) => step.latencyMs)
    .filter((value): value is number => value !== null);
  const modelLatencies = input.steps
    .filter((step) => step.kind === "MODEL")
    .map((step) => step.latencyMs)
    .filter((value): value is number => value !== null);
  const approvalWaits = input.approvals
    .map((approval) => elapsedMs(approval.requestedAt, approval.decidedAt))
    .filter((value): value is number => value !== null);
  const totalInputTokens = terminalRuns.reduce((sum, run) => sum + run.inputTokens, 0);
  const totalCachedInputTokens = terminalRuns.reduce(
    (sum, run) => sum + run.cachedInputTokens,
    0,
  );

  return {
    knowledge: {
      documentCount: input.documents.length,
      terminalDocumentCount: terminalDocuments.length,
      indexSuccessRate:
        terminalDocuments.length === 0
          ? null
          : terminalDocuments.filter((document) => document.status === "READY").length /
            terminalDocuments.length,
      queueLatencyMs: distribution(queueLatencies),
      indexingLatencyMs: distribution(indexingLatencies),
    },
    agent: {
      runCount: input.runs.length,
      terminalRunCount: terminalRuns.length,
      failureRate:
        terminalRuns.length === 0
          ? null
          : terminalRuns.filter((run) => run.status === "FAILED").length /
            terminalRuns.length,
      avgRetryCount: average(terminalRuns.map((run) => run.retryCount)),
      runLatencyMs: distribution(runLatencies),
      modelLatencyMs: distribution(modelLatencies),
      toolLatencyMs: distribution(toolLatencies),
      approvalWaitMs: distribution(approvalWaits),
      cachedInputRatio:
        totalInputTokens === 0 ? null : totalCachedInputTokens / totalInputTokens,
      avgCostMicrosPerRun: average(
        terminalRuns.map((run) => run.estimatedCostMicros),
      ),
    },
  };
}
