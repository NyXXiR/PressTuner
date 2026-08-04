import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildJudgeCalibrationArtifact } from "../domain/evaluation/judgeCalibrationArtifact";
import { judgePressRagClaim, PRESS_RAG_SEMANTIC_JUDGE_PROMPT } from "../lib/services/evaluation/pressRagSemanticJudge";

const JUDGE_SCHEMA_IDENTITY = { label: ["SUPPORTED", "UNSUPPORTED", "CONTRADICTORY"], rationale: "non-empty string" };
const JUDGE_HARD_CEILING_MICROS = 36_864;

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

export async function main() {
  const reviewPath = valueAfter("--review");
  const outputPath = valueAfter("--output");
  const cap = Number(valueAfter("--max-cost-micros"));
  if (!reviewPath || !outputPath || !process.argv.includes("--operator-authorized") ||
      !process.argv.includes("--allow-model-spend") || !Number.isFinite(cap) || cap < JUDGE_HARD_CEILING_MICROS) {
    throw new Error("JUDGE_CALIBRATION_EXPLICIT_AUTHORIZATION_AND_CAP_REQUIRED");
  }
  const review = JSON.parse(await readFile(resolve(reviewPath), "utf8"));
  if (review.status !== "APPROVED" || review.reviewer?.type !== "HUMAN" || review.candidates?.length !== 30) {
    throw new Error("JUDGE_CALIBRATION_APPROVED_HUMAN_REVIEW_REQUIRED");
  }
  const records = [];
  let totalCostMicros = 0;
  for (const candidate of review.candidates) {
    const judgment = await judgePressRagClaim(candidate);
    totalCostMicros += judgment.costMicros ?? 0;
    if (totalCostMicros > cap) throw new Error("JUDGE_CALIBRATION_COST_CAP_EXCEEDED");
    records.push({
      claimId: candidate.claimId, blinded: true as const, humanLabel: candidate.humanLabel,
      judgeLabel: judgment.label, rawJudgment: judgment.rawJudgment, rationale: judgment.rationale,
      reviewer: { type: "HUMAN" as const, id: review.reviewer.id }, costMicros: judgment.costMicros ?? 0,
    });
  }
  const artifact = buildJudgeCalibrationArtifact({
    model: "gpt-4.1-mini", temperature: 0, prompt: PRESS_RAG_SEMANTIC_JUDGE_PROMPT,
    schema: JUDGE_SCHEMA_IDENTITY, records,
  });
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output, status: artifact.status, agreement: artifact.agreement, falseSupportedRate: artifact.falseSupportedRate, totalCostMicros: artifact.totalCostMicros })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
