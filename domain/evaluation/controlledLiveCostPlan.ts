import { DEFAULT_PRESS_AGENT_RUNTIME_POLICY } from "../press-agent/runtimePolicy";
import type { ControlledLiveDataset } from "./controlledLiveEvaluation";
import type { PressKnowledgeRetrievalConfiguration } from "../knowledge/retrievalRuntime";

const RATES = Object.freeze({
  "gpt-4.1-mini": Object.freeze({
    inputMicrosPerMillionTokens: 400_000,
    outputMicrosPerMillionTokens: 1_600_000,
    source: "https://developers.openai.com/api/docs/models/gpt-4.1-mini (verified 2026-08-04)",
  }),
  "text-embedding-3-small": Object.freeze({
    inputMicrosPerMillionTokens: 20_000,
    outputMicrosPerMillionTokens: 0,
    source: "https://openai.com/index/new-embedding-models-and-api-updates/ (verified 2026-08-04)",
  }),
});

function tokenCost(tokens: number, rate: number) {
  return Math.ceil((tokens * rate) / 1_000_000);
}

export function buildControlledLiveCostPlan(input: Readonly<{
  dataset: ControlledLiveDataset;
  configurations: readonly PressKnowledgeRetrievalConfiguration[];
  agentRunCount: number;
  corpusFiles: readonly Readonly<{ filePath: string; bytes: number }>[];
  requestedCapMicros?: number;
  includeSemanticJudge?: boolean;
  caseIdsByConfiguration?: Readonly<Partial<Record<PressKnowledgeRetrievalConfiguration["id"], readonly string[]>>>;
}>) {
  const caseById = new Map(input.dataset.cases.map((entry) => [entry.id, entry]));
  const executionPlans = input.configurations.map((configuration) => {
    const ids = input.caseIdsByConfiguration?.[configuration.id] ?? input.dataset.cases.map(({ id }) => id);
    const cases = ids.map((id) => {
      const entry = caseById.get(id);
      if (!entry) throw new Error(`CONTROLLED_LIVE_COST_PLAN_UNKNOWN_CASE:${id}`);
      return entry;
    });
    const retrievalCaseCount = cases.filter(({ kind }) => kind === "RETRIEVAL_ONLY").length;
    const agentCaseCount = cases.length - retrievalCaseCount;
    return {
      configuration,
      cases,
      retrievalCaseCount,
      agentCaseCount,
      caseRuns: retrievalCaseCount + agentCaseCount * input.agentRunCount,
    };
  });
  const retrievalCaseCount = executionPlans.reduce((sum, plan) => sum + plan.retrievalCaseCount, 0);
  const agentCaseCount = executionPlans.reduce((sum, plan) => sum + plan.agentCaseCount, 0);
  const totalCaseRuns = executionPlans.reduce((sum, plan) => sum + plan.caseRuns, 0);
  const agentCalls = agentCaseCount * input.agentRunCount;
  const rewriteCalls = executionPlans
    .filter(({ configuration }) => configuration.queryTransformation === "MODEL_REWRITE")
    .reduce((sum, plan) => sum + plan.caseRuns, 0);
  const rerankCalls = executionPlans
    .filter(({ configuration }) => configuration.reranker === "MODEL_LISTWISE")
    .reduce((sum, plan) => sum + plan.caseRuns, 0);
  const judgeCalls = input.includeSemanticJudge === false ? 0 : 30;
  const corpusBytes = input.corpusFiles.reduce((sum, file) => sum + file.bytes, 0);
  const predictedChunksPerIndex = input.corpusFiles.reduce(
    (sum, file) => sum + Math.max(1, Math.ceil(file.bytes / 1_400)),
    0,
  );
  const indexingEmbeddingTokens = Math.ceil(corpusBytes / 4) * input.configurations.length;
  const queryEmbeddingTokens = executionPlans.reduce(
    (total, plan) => total + plan.cases.reduce(
      (sum, entry) => sum + Math.ceil(entry.prompt.length / 4) * (entry.kind === "AGENT" ? input.agentRunCount : 1),
      0,
    ),
    0,
  );

  const embeddingExpected = tokenCost(
    indexingEmbeddingTokens + queryEmbeddingTokens,
    RATES["text-embedding-3-small"].inputMicrosPerMillionTokens,
  );
  const rewriteExpected =
    tokenCost(rewriteCalls * 256, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(rewriteCalls * 64, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const rewriteHard =
    tokenCost(rewriteCalls * 512, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(rewriteCalls * 128, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const rerankExpected =
    tokenCost(rerankCalls * 3_000, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(rerankCalls * 256, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const rerankHard =
    tokenCost(rerankCalls * 12_000, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(rerankCalls * 1_024, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const judgeExpected =
    tokenCost(judgeCalls * 1_024, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(judgeCalls * 128, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const judgeHard =
    tokenCost(judgeCalls * 2_048, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(judgeCalls * 256, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const agentExpected =
    tokenCost(agentCalls * 15_000, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(agentCalls * 3_000, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const tokenBasedAgentHard =
    tokenCost(agentCalls * DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxInputTokens, RATES["gpt-4.1-mini"].inputMicrosPerMillionTokens) +
    tokenCost(agentCalls * DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxOutputTokens, RATES["gpt-4.1-mini"].outputMicrosPerMillionTokens);
  const agentHard = Math.max(
    tokenBasedAgentHard,
    agentCalls * DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxEstimatedCostMicros,
  );

  const components = {
    embedding: { expectedCostMicros: embeddingExpected, hardCeilingCostMicros: embeddingExpected },
    rewrite: { expectedCostMicros: rewriteExpected, hardCeilingCostMicros: rewriteHard },
    reranking: { expectedCostMicros: rerankExpected, hardCeilingCostMicros: rerankHard },
    semanticJudge: { expectedCostMicros: judgeExpected, hardCeilingCostMicros: judgeHard },
    agent: { expectedCostMicros: agentExpected, hardCeilingCostMicros: agentHard },
  };
  const expectedCostMicros = Object.values(components).reduce((sum, value) => sum + value.expectedCostMicros, 0);
  const hardCeilingCostMicros = Object.values(components).reduce((sum, value) => sum + value.hardCeilingCostMicros, 0);
  return Object.freeze({
    version: "press-rag-controlled-live-cost-plan/v1" as const,
    datasetHash: input.dataset.contentHash,
    selectedCases: new Set(executionPlans.flatMap(({ cases }) => cases.map(({ id }) => id))).size,
    configurationIds: input.configurations.map(({ id }) => id),
    runCounts: {
      retrievalCaseCountAcrossConfigurations: retrievalCaseCount,
      agentCaseCountAcrossConfigurations: agentCaseCount,
      agentRunsPerCase: input.agentRunCount,
      caseRunsByConfiguration: Object.fromEntries(
        executionPlans.map(({ configuration, caseRuns }) => [configuration.id, caseRuns]),
      ),
      totalCaseRuns,
    },
    corpus: {
      fileCount: input.corpusFiles.length,
      bytes: corpusBytes,
      predictedChunksPerIndex,
      predictedChunksAcrossConfigurations: predictedChunksPerIndex * input.configurations.length,
      estimatedIndexingEmbeddingTokens: indexingEmbeddingTokens,
    },
    calls: { queryEmbedding: totalCaseRuns, rewrite: rewriteCalls, reranking: rerankCalls, agent: agentCalls, semanticJudge: judgeCalls },
    tokenCeilings: {
      rewrite: { input: 512, output: 128 },
      reranking: { input: 12_000, output: 1_024 },
      semanticJudge: { input: 2_048, output: 256 },
      agent: {
        input: DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxInputTokens,
        output: DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxOutputTokens,
        costMicros: DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxEstimatedCostMicros,
      },
    },
    rates: RATES,
    components,
    expectedCostMicros,
    expectedCostUsd: expectedCostMicros / 1_000_000,
    hardCeilingCostMicros,
    hardCeilingCostUsd: hardCeilingCostMicros / 1_000_000,
    excludedCosts: [] as string[],
    requestedCapMicros: input.requestedCapMicros ?? null,
    capCoversEveryPlannedCall:
      input.requestedCapMicros !== undefined && input.requestedCapMicros >= hardCeilingCostMicros,
    sideEffectsPerformed: false,
  });
}
