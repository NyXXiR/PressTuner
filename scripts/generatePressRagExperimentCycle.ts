import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256Canonical } from "../domain/evaluation/configurationIdentity";
import { createAgentExperimentCycleEvidence } from "../domain/evaluation/experimentCycleEvidence";
import { DeterministicPressRagExecutor } from "../domain/evaluation/deterministicPressRagExecutor";
import { runAgentExperiment } from "../domain/evaluation/experimentRunner";

async function readJson(filePath: string) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = path.resolve(
    outputIndex >= 0
      ? process.argv[outputIndex + 1]
      : "evals/press-rag/improvement/deterministic-experiment-cycle-v2.json",
  );
  const rawDataset = await readJson("evals/press-rag/v3/cases.json");
  const cases = rawDataset.cases.map(
  (entry: { id: string; question: string; expectedBehavior?: Record<string, unknown> }) => ({
    id: entry.id,
    question: entry.question,
    expectedBehavior: entry.expectedBehavior ?? {},
  }),
  );
  const datasetBody = { version: rawDataset.version, cases };
  const experiment = await runAgentExperiment({
  executor: new DeterministicPressRagExecutor(),
  baseline: await readJson("evals/press-rag/configurations/baseline-v1.json"),
  candidate: await readJson("evals/press-rag/configurations/candidate-v2.json"),
  dataset: {
    id: rawDataset.version,
    ...datasetBody,
    contentHash: sha256Canonical(datasetBody),
  },
  environment: await readJson("evals/press-rag/environments/deterministic-v1.json"),
  });
  const evidence = createAgentExperimentCycleEvidence({
    cycleId: "press-tuner-cycle-002",
  sequence: 2,
  experiment,
  auditEvents: [
    {
      occurredAt: experiment.createdAt,
      eventType: "DETERMINISTIC_EXPERIMENT_RECORDED",
      failureCategory: null,
    },
  ],
  });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${evidence.evidenceHash}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
