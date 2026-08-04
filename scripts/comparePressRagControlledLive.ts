import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseControlledLiveDataset,
  type ControlledLiveExecutionArtifact,
} from "../domain/evaluation/controlledLiveEvaluation";
import { buildControlledLiveComparisonReport } from "../domain/evaluation/controlledLiveReport";
import type { JudgeCalibrationArtifact } from "../domain/evaluation/judgeCalibrationArtifact";

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

export function parseComparisonDataset(raw: string) {
  return parseControlledLiveDataset(JSON.parse(raw));
}

async function main() {
  const datasetPath = valueAfter("--dataset");
  const baselinePath = valueAfter("--baseline");
  const candidatePath = valueAfter("--candidate");
  const outputPath = valueAfter("--output");
  const calibrationPath = valueAfter("--calibration");
  if (!datasetPath || !baselinePath || !candidatePath || !outputPath) {
    throw new Error(
      "USAGE: --dataset <json> --baseline <artifact> --candidate <artifact> --output <report>",
    );
  }
  const [datasetRaw, baselineRaw, candidateRaw, calibrationRaw] = await Promise.all([
    readFile(resolve(datasetPath), "utf8"),
    readFile(resolve(baselinePath), "utf8"),
    readFile(resolve(candidatePath), "utf8"),
    calibrationPath ? readFile(resolve(calibrationPath), "utf8") : Promise.resolve(undefined),
  ]);
  const report = buildControlledLiveComparisonReport({
    dataset: parseComparisonDataset(datasetRaw),
    baseline: JSON.parse(baselineRaw) as ControlledLiveExecutionArtifact,
    candidate: JSON.parse(candidateRaw) as ControlledLiveExecutionArtifact,
    calibration: calibrationRaw
      ? (JSON.parse(calibrationRaw) as JudgeCalibrationArtifact)
      : undefined,
  });
  const absoluteOutput = resolve(outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${absoluteOutput}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
