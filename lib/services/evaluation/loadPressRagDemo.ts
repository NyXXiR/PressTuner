import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  presentPressRagDemo,
  type PressRagDemoViewModel,
} from "@/domain/evaluation/pressRagDemoPresenter";

const DATASET_PATH = "evals/press-rag/controlled-live/dataset-v4.approved.json";
const BASELINE_PATH = "evals/press-rag/controlled-live/results/baseline-v1.json";
const CANDIDATE_PATH =
  "evals/press-rag/controlled-live/results/candidate-v3-optimized.json";

async function readJson(relativePath: string): Promise<unknown> {
  const contents = await readFile(path.join(process.cwd(), relativePath), "utf8");
  return JSON.parse(contents) as unknown;
}

export async function loadPressRagDemo(): Promise<PressRagDemoViewModel> {
  const [dataset, baseline, candidate] = await Promise.all([
    readJson(DATASET_PATH),
    readJson(BASELINE_PATH),
    readJson(CANDIDATE_PATH),
  ]);
  return presentPressRagDemo({ dataset, baseline, candidate });
}
