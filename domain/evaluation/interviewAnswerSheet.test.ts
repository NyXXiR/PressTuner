import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CURRENT_PRESS_RAG_RUNTIME_IDENTITY } from "./pressRagRuntimeIdentity";
import {
  buildInterviewAnswerSheet,
  validateInterviewAnswerSheet,
} from "./interviewAnswerSheet";

test("answer sheet covers 70 detailed and 10 priority questions without inventing live evidence", async () => {
  const [catalogText, matrixText, datasetText] = await Promise.all([
    readFile("evals/press-rag/interview/questions.ko.json", "utf8").then((text) => {
      const catalog = JSON.parse(text) as { detailed: Array<{ id: string; question: string }>; priority: Array<{ id: string; question: string }> };
      return [...catalog.detailed, ...catalog.priority].map(({ id, question }) => `- \`${id}\` ${question}`).join("\n");
    }),
    readFile("docs/interview/rag-capability-matrix.md", "utf8"),
    readFile("evals/press-rag/controlled-live/dataset-v4.draft.json", "utf8"),
  ]);
  const sheet = buildInterviewAnswerSheet({
    catalogText,
    matrixText,
    runtimeIdentity: CURRENT_PRESS_RAG_RUNTIME_IDENTITY,
    dataset: JSON.parse(datasetText),
  });
  assert.deepEqual(validateInterviewAnswerSheet(sheet), {
    detailedQuestionCount: 70,
    priorityQuestionCount: 10,
  });
  assert.match(sheet, /EVIDENCE_STATUS: NOT_INTERVIEW_FINAL/);
  assert.match(sheet, /NOT_EXECUTED:/);
  assert.match(sheet, /APPROVED_HUMAN_DATASET_REQUIRED/);
  assert.match(sheet, new RegExp(CURRENT_PRESS_RAG_RUNTIME_IDENTITY.contentHash));
});

test("a rejected controlled-live candidate still produces a truthful interview-ready answer", async () => {
  const [questions, matrixText, dataset, cycle] = await Promise.all([
    readFile("evals/press-rag/interview/questions.ko.json", "utf8").then(JSON.parse),
    readFile("docs/interview/rag-capability-matrix.md", "utf8"),
    readFile("evals/press-rag/controlled-live/dataset-v4.approved.json", "utf8").then(JSON.parse),
    readFile("evals/press-rag/controlled-live/results/controlled-live-cycle-v3-optimized.json", "utf8").then(JSON.parse),
  ]);
  const catalogText = [...questions.detailed, ...questions.priority]
    .map(({ id, question }: { id: string; question: string }) => `- \`${id}\` ${question}`)
    .join("\n");
  const sheet = buildInterviewAnswerSheet({
    catalogText,
    matrixText,
    runtimeIdentity: CURRENT_PRESS_RAG_RUNTIME_IDENTITY,
    dataset,
    liveComparison: cycle,
  });
  assert.match(sheet, /EVIDENCE_STATUS: CONTROLLED_LIVE_NOT_PROMOTED/);
  assert.match(sheet, /Recall@5 0\.52→1/);
  assert.match(sheet, /candidate-v3에 identifier-aware normalization/);
  assert.match(sheet, /후보를 REJECT/);
  assert.doesNotMatch(sheet, /실제 live artifact가 없으므로/);
});
