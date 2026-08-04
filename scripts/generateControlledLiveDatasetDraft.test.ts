import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { parseControlledLiveDataset } from "../domain/evaluation/controlledLiveEvaluation";

const root = process.cwd();
const datasetPath = join(
  root,
  "evals/press-rag/controlled-live/dataset-v4.draft.json",
);

test("controlled-live v4 draft is source-backed and awaits human review", async () => {
  const dataset = parseControlledLiveDataset(
    JSON.parse(await readFile(datasetPath, "utf8")),
  );

  assert.equal(dataset.status, "DRAFT");
  assert.equal(dataset.author.type, "AI");
  assert.equal(dataset.approval, undefined);
  assert.equal(dataset.cases.length, 40);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(dataset.partitions).map(([name, ids]) => [name, ids.length]),
    ),
    { development: 10, regression: 12, adversarial: 10, holdout: 8 },
  );
  assert.ok(
    dataset.cases.every(
      (entry) =>
        entry.annotation.author.type === "AI" &&
        entry.annotation.reviewer === undefined &&
        entry.annotation.reviewedAt === undefined,
    ),
  );
  assert.ok(dataset.cases.some((entry) => entry.expectedAnswerability === "ABSTAIN"));
  assert.ok(dataset.cases.some((entry) => entry.expectedDocumentIds.length > 1));
  const tags = new Set(dataset.cases.flatMap((entry) => entry.tags));
  for (const tag of [
    "REPRESENTATIVE",
    "TABLE",
    "OCR",
    "VERSION",
    "CONFLICT",
    "UNANSWERABLE",
    "PROMPT_INJECTION",
    "AUTHORIZATION_POLICY",
    "DRAFT_CLAIM_VERIFICATION",
  ]) assert.ok(tags.has(tag as never), tag);
  assert.ok(dataset.cases.some((entry) => entry.expectedConflict !== "NONE"));
  assert.ok(dataset.cases.some((entry) => entry.requiresClaimEvidence));
  for (const ids of Object.values(dataset.partitions)) {
    const cases = ids.map((id) => dataset.cases.find((entry) => entry.id === id)!);
    assert.ok(cases.some(({ kind }) => kind === "RETRIEVAL_ONLY"));
    assert.ok(cases.some(({ kind }) => kind === "AGENT"));
  }

  const documents = dataset.corpora.flatMap((corpus) => corpus.documents);
  assert.equal(documents.length, 32);
  for (const document of documents) {
    const bytes = await readFile(join(root, document.filePath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), document.fileSha256);
  }
});
