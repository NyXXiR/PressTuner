import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { assertIndependentControlledLiveExecutions, parseControlledLiveDataset } from "../domain/evaluation/controlledLiveEvaluation";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function buildPressRagControlledLiveCycle(input: Readonly<{
  dataset: unknown;
  comparison: any;
  calibration: any;
  regressionGate: any;
  caseStudy: any;
}>) {
  const dataset = parseControlledLiveDataset(input.dataset);
  if (dataset.status !== "APPROVED") throw new Error("PRESS_RAG_CYCLE_APPROVED_DATASET_REQUIRED");
  if (input.comparison?.datasetHash !== dataset.contentHash) throw new Error("PRESS_RAG_CYCLE_DATASET_HASH_MISMATCH");
  const executionProvenance = input.comparison?.provenance;
  if (
    !executionProvenance ||
    executionProvenance.executorId !== "press-agent-controlled-live/v1" ||
    !executionProvenance.baseline ||
    !executionProvenance.candidate ||
    !Array.isArray(executionProvenance.baseline.caseRunIds) ||
    !Array.isArray(executionProvenance.candidate.caseRunIds)
  ) {
    throw new Error("PRESS_RAG_CYCLE_EXECUTION_PROVENANCE_REQUIRED");
  }
  assertIndependentControlledLiveExecutions(
    {
      ...executionProvenance.baseline,
      results: executionProvenance.baseline.caseRunIds.map((caseRunId: string) => ({ caseRunId })),
    },
    {
      ...executionProvenance.candidate,
      results: executionProvenance.candidate.caseRunIds.map((caseRunId: string) => ({ caseRunId })),
    },
  );
  if (
    input.comparison.baseline?.executionId !== executionProvenance.baseline.executionId ||
    input.comparison.candidate?.executionId !== executionProvenance.candidate.executionId ||
    input.comparison.baseline?.configurationHash !== executionProvenance.baseline.configurationHash ||
    input.comparison.candidate?.configurationHash !== executionProvenance.candidate.configurationHash
  ) {
    throw new Error("PRESS_RAG_CYCLE_SUMMARY_PROVENANCE_MISMATCH");
  }
  if (!input.comparison.baseline?.stageLatency || !input.comparison.candidate?.stageLatency) {
    throw new Error("PRESS_RAG_CYCLE_STAGE_EVIDENCE_REQUIRED");
  }
  if (
    typeof input.comparison.baseline.totalCostMicros !== "number" ||
    typeof input.comparison.candidate.totalCostMicros !== "number" ||
    !input.comparison.baseline.componentCostMicros ||
    !input.comparison.candidate.componentCostMicros ||
    typeof input.calibration?.totalCostMicros !== "number"
  ) throw new Error("PRESS_RAG_CYCLE_COST_EVIDENCE_REQUIRED");
  if (input.regressionGate?.disposition === "NOT_EVALUABLE") throw new Error("PRESS_RAG_CYCLE_EVALUABLE_GATE_REQUIRED");
  for (const key of ["failure", "hypothesis", "change", "independentComparison", "tradeoffs", "gateResult"] as const) {
    if (typeof input.caseStudy?.[key] !== "string" || !input.caseStudy[key].trim()) {
      throw new Error(`PRESS_RAG_CYCLE_CASE_STUDY_FIELD_REQUIRED:${key}`);
    }
  }
  return Object.freeze({
    version: "press-rag-controlled-live-cycle/v1" as const,
    createdAt: executionProvenance.candidate.completedAt,
    evidenceClass: "CONTROLLED_LIVE" as const,
    datasetHash: dataset.contentHash,
    comparison: input.comparison,
    calibration: input.calibration,
    regressionGate: input.regressionGate,
    caseStudy: {
      ...input.caseStudy,
      valid: input.calibration?.status === "PASS" && input.regressionGate?.disposition === "PROMOTE",
      evidenceClass: "CONTROLLED_LIVE" as const,
      datasetHash: dataset.contentHash,
    },
    inputHashes: {
      comparison: hash(input.comparison),
      calibration: hash(input.calibration),
      regressionGate: hash(input.regressionGate),
      caseStudy: hash(input.caseStudy),
    },
    deploymentAuthorized: false as const,
  });
}

async function main() {
  const value = (name: string) => {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) throw new Error(`PRESS_RAG_CYCLE_PATH_REQUIRED:${name}`);
    return resolve(process.argv[index + 1]!);
  };
  const [dataset, comparison, calibration, regressionGate, caseStudy] = await Promise.all([
    value("--dataset"), value("--comparison"), value("--calibration"), value("--gate"), value("--case-study"),
  ].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const cycle = buildPressRagControlledLiveCycle({ dataset, comparison, calibration, regressionGate, caseStudy });
  const output = value("--output");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(cycle, null, 2)}\n`, "utf8");
  process.stdout.write(`${output}\n`);
}

if (import.meta.url.endsWith(process.argv[1] ?? "")) void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
