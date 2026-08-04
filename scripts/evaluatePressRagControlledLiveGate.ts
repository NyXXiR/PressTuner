import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateControlledLiveRagRegressionGate } from "../domain/evaluation/controlledLiveRegressionGate";

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

export async function main() {
  const comparisonPath = valueAfter("--comparison");
  const calibrationPath = valueAfter("--calibration");
  const outputPath = valueAfter("--output");
  const humanReview = valueAfter("--human-review") as "PENDING" | "APPROVED" | "REJECTED" | undefined;
  if (!comparisonPath || !calibrationPath || !outputPath || !humanReview) {
    throw new Error("USAGE: --comparison <json> --calibration <json> --human-review <PENDING|APPROVED|REJECTED> --output <json>");
  }
  if (!["PENDING", "APPROVED", "REJECTED"].includes(humanReview)) throw new Error("CONTROLLED_LIVE_GATE_HUMAN_REVIEW_INVALID");
  const [comparison, calibration] = await Promise.all([
    readFile(resolve(comparisonPath), "utf8").then(JSON.parse),
    readFile(resolve(calibrationPath), "utf8").then(JSON.parse),
  ]);
  const gate = evaluateControlledLiveRagRegressionGate({ comparison, calibration, humanReview });
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  process.stdout.write(`${output}\n`);
  return gate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
