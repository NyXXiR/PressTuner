import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

import { parseControlledLiveDataset } from "../domain/evaluation/controlledLiveEvaluation";
import { buildJudgeCalibrationReviewDraft, type CalibrationSeed } from "../domain/evaluation/judgeCalibrationReview";

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function pdfText(filePath: string) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(resolve(filePath))));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

export async function main() {
  const datasetPath = valueAfter("--dataset");
  const outputPath = valueAfter("--output");
  if (!datasetPath || !outputPath) throw new Error("USAGE: --dataset <approved-json> --output <json>");
  const dataset = parseControlledLiveDataset(JSON.parse(await readFile(resolve(datasetPath), "utf8")));
  if (dataset.status !== "APPROVED") throw new Error("JUDGE_CALIBRATION_APPROVED_DATASET_REQUIRED");
  const documentById = new Map(dataset.corpora.flatMap(({ documents }) => documents).map((document) => [document.id, document]));
  const seeds: CalibrationSeed[] = [];
  for (const entry of dataset.cases) {
    const documentId = entry.expectedDocumentIds[0];
    const fact = entry.requiredFacts[0];
    const document = documentId ? documentById.get(documentId) : undefined;
    if (!document || !fact || seeds.some(({ sourceId }) => sourceId === document.id)) continue;
    const text = await pdfText(document.filePath);
    if (!text.includes(fact.value)) continue;
    seeds.push({ id: entry.id, factValue: fact.value, sourceId: document.id, exactEvidence: text.slice(0, 2_000) });
    if (seeds.length === 15) break;
  }
  const review = buildJudgeCalibrationReviewDraft(seeds);
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output, contentHash: review.contentHash, candidateCount: review.candidates.length })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
