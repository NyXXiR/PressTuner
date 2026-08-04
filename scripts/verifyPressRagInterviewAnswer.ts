import { access, readFile } from "node:fs/promises";

import { buildInterviewAnswerSheet, validateInterviewAnswerSheet } from "../domain/evaluation/interviewAnswerSheet";
import { CURRENT_PRESS_RAG_RUNTIME_IDENTITY } from "../domain/evaluation/pressRagRuntimeIdentity";

export async function verifyPressRagInterviewAnswer(args?: Readonly<{
  answerPath?: string;
  datasetPath?: string;
  cyclePath?: string;
}>) {
  const questions = JSON.parse(await readFile("evals/press-rag/interview/questions.ko.json", "utf8")) as {
    detailed: Array<{ id: string; question: string }>;
    priority: Array<{ id: string; question: string }>;
  };
  const catalogText = [...questions.detailed, ...questions.priority].map(({ id, question }) => `- \`${id}\` ${question}`).join("\n");
  const approvedDatasetPath = "evals/press-rag/controlled-live/dataset-v4.approved.json";
  const datasetPath = args?.datasetPath ?? await access(approvedDatasetPath).then(
    () => approvedDatasetPath,
    () => "evals/press-rag/controlled-live/dataset-v4.draft.json",
  );
  const [matrixText, datasetText, answer, cycleText] = await Promise.all([
    readFile("docs/interview/rag-capability-matrix.md", "utf8"),
    readFile(datasetPath, "utf8"),
    readFile(args?.answerPath ?? "docs/interview/PRESSTUNER_RAG_INTERVIEW_ANSWER.txt", "utf8"),
    args?.cyclePath ? readFile(args.cyclePath, "utf8") : Promise.resolve(undefined),
  ]);
  const expected = buildInterviewAnswerSheet({
    catalogText,
    matrixText,
    runtimeIdentity: CURRENT_PRESS_RAG_RUNTIME_IDENTITY,
    dataset: JSON.parse(datasetText),
    liveComparison: cycleText ? JSON.parse(cycleText) : undefined,
  });
  validateInterviewAnswerSheet(answer);
  if (answer !== expected) throw new Error("PRESS_RAG_INTERVIEW_ANSWER_NOT_REPRODUCIBLE");
  return {
    status:
      answer.includes("EVIDENCE_STATUS: LIVE_COMPARISON_ATTACHED") ||
      answer.includes("EVIDENCE_STATUS: CONTROLLED_LIVE_NOT_PROMOTED")
        ? "INTERVIEW_FINAL"
        : "NOT_INTERVIEW_FINAL",
  } as const;
}

if (import.meta.url.endsWith(process.argv[1] ?? "")) void verifyPressRagInterviewAnswer({
  datasetPath: process.env.PT_RAG_DATASET_PATH,
  cyclePath: process.env.PT_RAG_LIVE_COMPARISON_PATH,
}).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
