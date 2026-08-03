import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256Canonical } from "../domain/evaluation/configurationIdentity";
import { DeterministicPressRagExecutor } from "../domain/evaluation/deterministicPressRagExecutor";
import { runAgentExperiment } from "../domain/evaluation/experimentRunner";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`MISSING_REQUIRED_OPTION:${name}`);
  return path.resolve(value);
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function main() {
  const executorName = option("--executor") ?? "deterministic";
  if (executorName === "live") {
    if (!process.argv.includes("--allow-model-spend")) {
      throw new Error("LIVE_EXECUTION_REQUIRES_ALLOW_MODEL_SPEND");
    }
    throw new Error("LIVE_EXECUTOR_REQUIRES_AUTHORIZED_PRODUCTION_CONTEXT");
  }
  if (executorName !== "deterministic") {
    throw new Error(`UNKNOWN_EXECUTOR:${executorName}`);
  }
  const rawDataset = (await readJson(required("--dataset"))) as {
    version: string;
    cases: Array<{
      id: string;
      question: string;
      expectedBehavior?: Record<string, unknown>;
    }>;
  };
  const cases = rawDataset.cases.map((entry) => ({
    id: entry.id,
    question: entry.question,
    expectedBehavior: entry.expectedBehavior ?? {},
  }));
  const datasetBody = { version: rawDataset.version, cases };
  const dataset = {
    id: rawDataset.version,
    ...datasetBody,
    contentHash: sha256Canonical(datasetBody),
  };
  const artifact = await runAgentExperiment({
    executor: new DeterministicPressRagExecutor(),
    baseline: await readJson(required("--baseline")),
    candidate: await readJson(required("--candidate")),
    dataset,
    environment: await readJson(
      path.resolve(
        option("--environment") ??
          "evals/press-rag/environments/deterministic-v1.json",
      ),
    ),
  });
  const output = required("--output");
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: "wx",
  }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(output, "utf8");
    const next = `${JSON.stringify(artifact, null, 2)}\n`;
    if (existing !== next) throw new Error("EXPERIMENT_OUTPUT_ALREADY_EXISTS");
  });
  process.stdout.write(`${artifact.artifactHash}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
