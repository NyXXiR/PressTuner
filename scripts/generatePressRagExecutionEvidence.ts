import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildPressRagExecutionEvidence } from "../domain/evaluation/pressRagExecutionEvidence";
import { presentPressRagDemo } from "../domain/evaluation/pressRagDemoPresenter";

const SOURCES = ["evals/press-rag/controlled-live/dataset-v4.approved.json", "evals/press-rag/controlled-live/results/baseline-v1.json", "evals/press-rag/controlled-live/results/candidate-v3-optimized.json"] as const;
export const PRESS_RAG_EXECUTION_EVIDENCE_PATH = "evals/press-rag/improvement/press-rag-execution-evidence-v1.json";

export async function buildPressRagExecutionEvidenceBytes(root = process.cwd()) {
  const [dataset, baseline, candidate] = await Promise.all(SOURCES.map(async (name) => JSON.parse(await readFile(path.join(root, name), "utf8")) as unknown));
  return `${JSON.stringify(buildPressRagExecutionEvidence(presentPressRagDemo({ dataset, baseline, candidate })), null, 2)}\n`;
}

export async function generatePressRagExecutionEvidence({ root = process.cwd(), check = false } = {}) {
  const output = path.join(root, PRESS_RAG_EXECUTION_EVIDENCE_PATH); const bytes = await buildPressRagExecutionEvidenceBytes(root);
  if (check) {
    if (await readFile(output, "utf8").catch(() => "") !== bytes) throw new Error("PRESS_RAG_EXECUTION_EVIDENCE_DRIFT");
  } else await writeFile(output, bytes, "utf8");
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  generatePressRagExecutionEvidence({ check: process.argv.includes("--check") })
    .then((output) => process.stdout.write(`${process.argv.includes("--check") ? "Verified" : "Wrote"} ${output}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : error}\n`); process.exitCode = 1; });
}
