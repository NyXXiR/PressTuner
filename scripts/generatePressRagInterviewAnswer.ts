import { access, readFile, writeFile } from "node:fs/promises";

import {
  buildInterviewAnswerSheet,
  validateInterviewAnswerSheet,
} from "../domain/evaluation/interviewAnswerSheet";
import { CURRENT_PRESS_RAG_RUNTIME_IDENTITY } from "../domain/evaluation/pressRagRuntimeIdentity";

async function main() {
  const approvedDatasetPath = "evals/press-rag/controlled-live/dataset-v4.approved.json";
  const datasetPath = process.env.PT_RAG_DATASET_PATH?.trim() ??
    await access(approvedDatasetPath).then(() => approvedDatasetPath, () => "evals/press-rag/controlled-live/dataset-v4.draft.json");
  const [questionsText, matrixText, datasetText] = await Promise.all([
    readFile("evals/press-rag/interview/questions.ko.json", "utf8"),
    readFile("docs/interview/rag-capability-matrix.md", "utf8"),
    readFile(datasetPath, "utf8"),
  ]);
  const questions = JSON.parse(questionsText) as {
    detailed: Array<{ id: string; question: string }>;
    priority: Array<{ id: string; question: string }>;
  };
  const catalogText = [...questions.detailed, ...questions.priority]
    .map(({ id, question }) => `- \`${id}\` ${question}`)
    .join("\n");
  const liveComparisonPath = process.env.PT_RAG_LIVE_COMPARISON_PATH?.trim();
  const liveComparison = liveComparisonPath
    ? JSON.parse(await readFile(liveComparisonPath, "utf8"))
    : undefined;
  const answer = buildInterviewAnswerSheet({
    catalogText,
    matrixText,
    runtimeIdentity: CURRENT_PRESS_RAG_RUNTIME_IDENTITY,
    dataset: JSON.parse(datasetText),
    liveComparison,
  });
  validateInterviewAnswerSheet(answer);
  const output = "docs/interview/PRESSTUNER_RAG_INTERVIEW_ANSWER.txt";
  await writeFile(output, answer, "utf8");
  process.stdout.write(`${output}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
