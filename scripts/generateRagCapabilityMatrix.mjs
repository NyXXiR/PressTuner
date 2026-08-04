import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildRagCapabilityMatrix,
  validateRagCapabilityMatrix,
} from "./rag-capability-matrix.mjs";

const catalogPath = path.resolve(
  ".agent-work/rag-interview-readiness/QUESTION_CATALOG.md",
);
const outputPath = path.resolve("docs/interview/rag-capability-matrix.md");

const catalogText = await readFile(catalogPath, "utf8");
const expected = `${buildRagCapabilityMatrix(catalogText)}\n`;

if (process.argv.includes("--check")) {
  const actual = await readFile(outputPath, "utf8");
  if (actual !== expected) throw new Error("RAG_CAPABILITY_MATRIX_STALE");
  const result = validateRagCapabilityMatrix({ catalogText, matrixText: actual });
  process.stdout.write(
    `verified ${result.detailedQuestionCount} detailed questions, ${result.priorityAliasCount} priority aliases\n`,
  );
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, expected);
  const result = validateRagCapabilityMatrix({ catalogText, matrixText: expected });
  process.stdout.write(
    `generated ${outputPath} (${result.detailedQuestionCount} detailed questions, ${result.priorityAliasCount} priority aliases)\n`,
  );
}
