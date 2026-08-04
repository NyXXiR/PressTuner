import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { approveJudgeCalibrationReview, buildJudgeCalibrationReviewDraft } from "../domain/evaluation/judgeCalibrationReview";

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

export async function main() {
  const reviewPath = valueAfter("--review");
  const outputPath = valueAfter("--output");
  const reviewerId = valueAfter("--reviewer");
  const approvedAt = valueAfter("--approved-at");
  if (!reviewPath || !outputPath || !reviewerId || !approvedAt || !process.argv.includes("--accept-suggestions")) {
    throw new Error("EXPLICIT_HUMAN_ACCEPTANCE_REQUIRED");
  }
  const raw = JSON.parse(await readFile(resolve(reviewPath), "utf8"));
  const approved = approveJudgeCalibrationReview({
    review: raw as ReturnType<typeof buildJudgeCalibrationReviewDraft>, reviewerId, approvedAt,
  });
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
