import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildControlledLiveCostPlan } from "../domain/evaluation/controlledLiveCostPlan";
import {
  createPressAgentEvaluationExecutor,
  parseControlledLiveDataset,
} from "../domain/evaluation/controlledLiveEvaluation";
import { resolvePressRagControlledLiveConfigurationIdentity } from "../domain/evaluation/pressRagRuntimeIdentity";
import {
  PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS,
  resolvePressKnowledgeRetrievalConfiguration,
} from "../domain/knowledge/retrievalRuntime";
import { createPressRagControlledLiveAdapter } from "../lib/services/evaluation/pressRagControlledLiveAdapter";

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function has(name: string) {
  return process.argv.includes(name);
}

export function configureControlledLiveDatabase(args: Readonly<{
  useTestDatabase: boolean;
  testDatabaseUrl?: string;
  databaseUrl?: string;
}>) {
  if (!args.useTestDatabase) return;
  const source = args.testDatabaseUrl?.trim() || args.databaseUrl?.trim();
  if (!source) throw new Error("CONTROLLED_LIVE_TEST_DATABASE_URL_REQUIRED");
  const parsed = new URL(source);
  if (!args.testDatabaseUrl?.trim()) {
    const databaseName = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (!databaseName) throw new Error("CONTROLLED_LIVE_TEST_DATABASE_NAME_REQUIRED");
    parsed.pathname = `/${databaseName}_test`;
  }
  const databaseName = parsed.pathname.split("/").filter(Boolean).at(-1);
  if (!databaseName || !databaseName.endsWith("_test")) {
    throw new Error("CONTROLLED_LIVE_TEST_DATABASE_NAME_REQUIRED");
  }
  process.env.DATABASE_URL = parsed.toString();
}

function positiveNumber(name: string, required: boolean) {
  const raw = valueAfter(name);
  if (!required && raw === undefined) return undefined;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`CONTROLLED_LIVE_CLI_POSITIVE_NUMBER_REQUIRED:${name}`);
  }
  return parsed;
}

function configurationIds(raw = "baseline-v1") {
  if (raw === "all") return Object.keys(PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS) as Array<keyof typeof PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS>;
  if (!(raw in PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS)) {
    throw new Error(`CONTROLLED_LIVE_CONFIGURATION_INVALID:${raw}`);
  }
  return [raw as keyof typeof PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS];
}

function selectedCaseIds(dataset: ReturnType<typeof parseControlledLiveDataset>, partition?: string) {
  if (!partition || partition === "all") return dataset.cases.map(({ id }) => id);
  if (partition === "evaluation") {
    return [
      ...dataset.partitions.regression,
      ...dataset.partitions.adversarial,
      ...dataset.partitions.holdout,
    ];
  }
  if (!(partition in dataset.partitions)) throw new Error(`CONTROLLED_LIVE_PARTITION_INVALID:${partition}`);
  return [...dataset.partitions[partition as keyof typeof dataset.partitions]];
}

export async function main() {
  configureControlledLiveDatabase({
    useTestDatabase: has("--use-test-database"),
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
  });
  const dryRun = has("--dry-run");
  const selectedConfigurationIds = configurationIds(valueAfter("--configuration") ?? (dryRun ? "all" : "baseline-v1"));
  const agentRunCount = Number(valueAfter("--agent-runs") ?? "3");
  if (!Number.isInteger(agentRunCount) || agentRunCount < 3) {
    throw new Error("CONTROLLED_LIVE_AGENT_RUN_COUNT_MUST_BE_AT_LEAST_3");
  }
  const datasetPath = resolve(
    valueAfter("--dataset") ?? "evals/press-rag/controlled-live/dataset-v4.draft.json",
  );
  const datasetInput = JSON.parse(await readFile(datasetPath, "utf8"));
  const dataset = parseControlledLiveDataset(datasetInput);
  const requestedPartition = valueAfter("--partition");

  if (dryRun) {
    const corpusFiles = await Promise.all(
      dataset.corpora.flatMap((corpus) => corpus.documents).map(async (document) => ({
        filePath: document.filePath,
        bytes: (await stat(resolve(document.filePath))).size,
      })),
    );
    const plan = buildControlledLiveCostPlan({
      dataset,
      configurations: selectedConfigurationIds.map(resolvePressKnowledgeRetrievalConfiguration),
      agentRunCount,
      corpusFiles,
      requestedCapMicros: positiveNumber("--max-cost-micros", false),
      includeSemanticJudge: !has("--execution-only"),
      caseIdsByConfiguration:
        selectedConfigurationIds.length > 1 && requestedPartition === undefined
          ? {
              "rewrite-ablation-v1": dataset.partitions.development,
              "reranker-ablation-v1": dataset.partitions.development,
            }
          : Object.fromEntries(
              selectedConfigurationIds.map((id) => [id, selectedCaseIds(dataset, requestedPartition)]),
            ),
    });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return plan;
  }

  if (selectedConfigurationIds.length !== 1) {
    throw new Error("CONTROLLED_LIVE_EXECUTION_REQUIRES_ONE_CONFIGURATION");
  }
  if (valueAfter("--executor") !== "live") throw new Error("CONTROLLED_LIVE_EXECUTOR_MUST_BE_LIVE");
  if (!has("--operator-authorized")) throw new Error("CONTROLLED_LIVE_OPERATOR_AUTHORIZATION_REQUIRED");
  if (!has("--allow-model-spend")) throw new Error("CONTROLLED_LIVE_MODEL_SPEND_NOT_ALLOWED");
  const maxCostMicros = positiveNumber("--max-cost-micros", true)!;
  const outputArgument = valueAfter("--output");
  if (!outputArgument) throw new Error("CONTROLLED_LIVE_OUTPUT_PATH_REQUIRED");
  const configurationId = selectedConfigurationIds[0]!;
  const executionCaseIds = selectedCaseIds(dataset, requestedPartition);
  const corpusFiles = await Promise.all(
    dataset.corpora.flatMap((corpus) => corpus.documents).map(async (document) => ({
      filePath: document.filePath,
      bytes: (await stat(resolve(document.filePath))).size,
    })),
  );
  const preauthorization = buildControlledLiveCostPlan({
    dataset,
    configurations: [resolvePressKnowledgeRetrievalConfiguration(configurationId)],
    agentRunCount,
    corpusFiles,
    requestedCapMicros: maxCostMicros,
    includeSemanticJudge: false,
    caseIdsByConfiguration: { [configurationId]: executionCaseIds },
  });
  if (!preauthorization.capCoversEveryPlannedCall) {
    throw new Error(
      `CONTROLLED_LIVE_COST_CAP_DOES_NOT_COVER_PLAN:required=${preauthorization.hardCeilingCostMicros}:provided=${maxCostMicros}`,
    );
  }
  const identity = resolvePressRagControlledLiveConfigurationIdentity(configurationId);
  const adapter = createPressRagControlledLiveAdapter({
    projectRoot: process.cwd(),
    configurationId,
  });
  const artifact = await createPressAgentEvaluationExecutor(adapter).execute({
    dataset: datasetInput,
    requestedConfigurationHash: identity.contentHash,
    authorization: { executor: "live", operatorAuthorized: true, allowModelSpend: true, maxCostMicros },
    agentRunCount,
    selectedCaseIds: executionCaseIds,
  });
  const outputPath = resolve(outputArgument);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, executionId: artifact.executionId, datasetHash: artifact.datasetHash, configurationHash: artifact.configurationHash, totalCostMicros: artifact.totalCostMicros, caseRunCount: artifact.results.length })}\n`);
  return artifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
