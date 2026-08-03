import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildControlledReplayImprovementCycle,
  parseAgentImprovementCycleArtifact,
} from "../domain/evaluation/agentImprovementCycle";
import {
  parsePressRagFixtures,
  parsePressRagResultArtifact,
} from "../domain/evaluation/pressRagEvaluation";

const DATASET_PATH = "evals/press-rag/v1/cases.json";
const CORPUS_PATH = "evals/press-rag/v1/corpus.json";
const RESULT_PATH = "evals/press-rag/v1/results-2026-07-23.json";
const DEFAULT_OUTPUT_PATH =
  "evals/press-rag/improvement/controlled-replay-v1.json";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function outputPath(argv: string[]) {
  if (argv.length === 0) return DEFAULT_OUTPUT_PATH;
  if (argv.length === 2 && argv[0] === "--output" && argv[1]) return argv[1];
  throw new Error("Usage: generatePressRagImprovementCycle [--output PATH]");
}

const output = outputPath(process.argv.slice(2));
const fixtures = parsePressRagFixtures({
  dataset: readJson(DATASET_PATH),
  corpus: readJson(CORPUS_PATH),
});
const resultArtifact = parsePressRagResultArtifact(
  readJson(RESULT_PATH),
  fixtures,
);
const cycle = buildControlledReplayImprovementCycle({
  fixtures,
  artifact: resultArtifact,
  sourcePaths: {
    dataset: DATASET_PATH,
    corpus: CORPUS_PATH,
    result: RESULT_PATH,
  },
});
const validated = parseAgentImprovementCycleArtifact(cycle);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
console.log(`Wrote ${output}`);
