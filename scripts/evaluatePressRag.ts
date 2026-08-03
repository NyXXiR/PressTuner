import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildPressRagReport,
  parsePressRagFixtures,
} from "../domain/evaluation/pressRagEvaluation";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const datasetPath = resolve(
    argument("--dataset") ?? "evals/press-rag/v1/cases.json",
  );
  const resultsPath = argument("--results");
  const outputPath = argument("--output");
  const corpusPath = resolve(
    argument("--corpus") ?? resolve(dirname(datasetPath), "corpus.json"),
  );
  const fixtures = parsePressRagFixtures({
    dataset: JSON.parse(await readFile(datasetPath, "utf8")),
    corpus: JSON.parse(await readFile(corpusPath, "utf8")),
  });

  if (!resultsPath) {
    console.log(
      JSON.stringify(
        {
          valid: true,
          version: fixtures.dataset.version,
          corpusVersion: fixtures.corpus.version,
          caseCount: fixtures.dataset.cases.length,
          documentCount: fixtures.corpus.documents.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const artifact = JSON.parse(await readFile(resolve(resultsPath), "utf8"));
  const report = buildPressRagReport({ fixtures, artifact });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) await writeFile(resolve(outputPath), serialized, "utf8");
  else console.log(serialized);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
