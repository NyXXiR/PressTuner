import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ControlledLiveEvaluationError } from "../domain/evaluation/controlledLiveEvaluation";
import { approveControlledLiveDataset } from "./approveControlledLiveDataset";

const dataset = JSON.parse(
  readFileSync("evals/press-rag/controlled-live/dataset-v4.draft.json", "utf8"),
);

function review(overrides: Record<string, unknown> = {}) {
  const reviewedAt = "2026-08-04T01:00:00.000Z";
  return {
    version: "controlled-live-dataset-review/v1",
    status: "COMPLETE",
    datasetContentHash: dataset.contentHash,
    reviewer: { type: "HUMAN", id: "independent-reviewer-1" },
    approvedAt: "2026-08-04T02:00:00.000Z",
    holdoutUntouched: true,
    decisions: dataset.cases.map((entry: { id: string }) => ({
      caseId: entry.id,
      decision: "APPROVE",
      reviewedAt,
    })),
    documents: dataset.corpora.flatMap((corpus: { documents: unknown[] }) =>
      corpus.documents.map((entry) => ({
        documentId: (entry as { id: string }).id,
        fileSha256: (entry as { fileSha256: string }).fileSha256,
        decision: "APPROVE",
      }))),
    ...overrides,
  };
}

function code(expected: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ControlledLiveEvaluationError);
    assert.equal(error.code, expected);
    return true;
  };
}

test("approval retains dataset identity and adds complete human provenance", () => {
  const approved = approveControlledLiveDataset({ dataset, review: review() });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.contentHash, dataset.contentHash);
  assert.ok(approved.cases.every((entry) => entry.annotation.reviewer?.type === "HUMAN"));
});

test("approval rejects stale hashes, AI reviewers, omissions, rejection, and changed files", () => {
  assert.throws(
    () => approveControlledLiveDataset({ dataset, review: review({ datasetContentHash: "f".repeat(64) }) }),
    code("CONTROLLED_LIVE_REVIEW_DATASET_HASH_MISMATCH"),
  );
  assert.throws(
    () => approveControlledLiveDataset({ dataset, review: review({ reviewer: { type: "AI", id: "judge" } }) }),
    code("CONTROLLED_LIVE_INDEPENDENT_HUMAN_REVIEWER_REQUIRED"),
  );
  assert.throws(
    () => approveControlledLiveDataset({ dataset, review: review({ approvedAt: "2026" }) }),
    code("CONTROLLED_LIVE_REVIEW_TIMESTAMP_INVALID"),
  );
  const missing = review();
  missing.decisions.pop();
  assert.throws(
    () => approveControlledLiveDataset({ dataset, review: missing }),
    code(`CONTROLLED_LIVE_CASE_REVIEW_MISSING:${dataset.cases.at(-1).id}`),
  );
  const rejected = review();
  rejected.decisions[0].decision = "REJECT";
  assert.throws(
    () => approveControlledLiveDataset({ dataset, review: rejected }),
    code(`CONTROLLED_LIVE_CASE_REVIEW_REJECTED:${dataset.cases[0].id}`),
  );
  assert.throws(
    () => approveControlledLiveDataset({
      dataset,
      review: review(),
      fileHashes: { [dataset.corpora[0].documents[0].id]: "0".repeat(64) },
    }),
    code(`CONTROLLED_LIVE_DOCUMENT_FILE_HASH_CHANGED:${dataset.corpora[0].documents[0].id}`),
  );
});
