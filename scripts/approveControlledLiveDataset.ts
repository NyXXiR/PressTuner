import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import {
  ControlledLiveEvaluationError,
  parseControlledLiveDataset,
} from "../domain/evaluation/controlledLiveEvaluation";

type ReviewDecision = Readonly<{
  caseId: string;
  decision: "APPROVE" | "REJECT";
  reviewedAt: string;
}>;

type DocumentDecision = Readonly<{
  documentId: string;
  fileSha256: string;
  decision: "APPROVE" | "REJECT";
}>;

type DatasetReview = Readonly<{
  version: "controlled-live-dataset-review/v1";
  status: "COMPLETE";
  datasetContentHash: string;
  reviewer: Readonly<{ type: "HUMAN"; id: string }>;
  approvedAt: string;
  holdoutUntouched: true;
  decisions: readonly ReviewDecision[];
  documents: readonly DocumentDecision[];
}>;

function approvalError(code: string): never {
  throw new ControlledLiveEvaluationError(code);
}

function validTimestamp(value: unknown): value is string {
  return z.string().datetime({ offset: true }).safeParse(value).success;
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

export function approveControlledLiveDataset(input: Readonly<{
  dataset: unknown;
  review: unknown;
  fileHashes?: Readonly<Record<string, string>>;
}>): ReturnType<typeof parseControlledLiveDataset> {
  const dataset = parseControlledLiveDataset(input.dataset);
  if (dataset.status !== "DRAFT") approvalError("CONTROLLED_LIVE_APPROVAL_REQUIRES_DRAFT");
  if (input.review === null || typeof input.review !== "object") {
    approvalError("CONTROLLED_LIVE_REVIEW_INVALID");
  }
  const review = input.review as Partial<DatasetReview>;
  if (review.version !== "controlled-live-dataset-review/v1" || review.status !== "COMPLETE") {
    approvalError("CONTROLLED_LIVE_REVIEW_INCOMPLETE");
  }
  if (
    review.reviewer?.type !== "HUMAN" ||
    typeof review.reviewer.id !== "string" ||
    review.reviewer.id.trim().length === 0 ||
    review.reviewer.id === dataset.author.id
  ) {
    approvalError("CONTROLLED_LIVE_INDEPENDENT_HUMAN_REVIEWER_REQUIRED");
  }
  if (review.datasetContentHash !== dataset.contentHash) {
    approvalError("CONTROLLED_LIVE_REVIEW_DATASET_HASH_MISMATCH");
  }
  if (!validTimestamp(review.approvedAt)) {
    approvalError("CONTROLLED_LIVE_REVIEW_TIMESTAMP_INVALID");
  }
  if (Date.parse(review.approvedAt) < Date.parse(dataset.createdAt)) {
    approvalError("CONTROLLED_LIVE_REVIEW_PREDATES_DATASET");
  }
  if (review.holdoutUntouched !== true) {
    approvalError("CONTROLLED_LIVE_HOLDOUT_REVIEW_CONFIRMATION_REQUIRED");
  }

  const decisions = Array.isArray(review.decisions) ? review.decisions : [];
  if (!uniqueBy(decisions, ({ caseId }) => caseId)) {
    approvalError("CONTROLLED_LIVE_DUPLICATE_CASE_REVIEW");
  }
  const decisionByCase = new Map(decisions.map((decision) => [decision.caseId, decision]));
  for (const entry of dataset.cases) {
    const decision = decisionByCase.get(entry.id);
    if (decision === undefined) approvalError(`CONTROLLED_LIVE_CASE_REVIEW_MISSING:${entry.id}`);
    if (decision.decision !== "APPROVE") approvalError(`CONTROLLED_LIVE_CASE_REVIEW_REJECTED:${entry.id}`);
    if (!validTimestamp(decision.reviewedAt)) {
      approvalError(`CONTROLLED_LIVE_CASE_REVIEW_TIMESTAMP_INVALID:${entry.id}`);
    }
    if (
      Date.parse(decision.reviewedAt) < Date.parse(dataset.createdAt) ||
      Date.parse(decision.reviewedAt) > Date.parse(review.approvedAt)
    ) {
      approvalError(`CONTROLLED_LIVE_CASE_REVIEW_TIMESTAMP_OUT_OF_RANGE:${entry.id}`);
    }
  }
  if (decisionByCase.size !== dataset.cases.length) {
    approvalError("CONTROLLED_LIVE_UNKNOWN_CASE_REVIEW");
  }

  const documents = Array.isArray(review.documents) ? review.documents : [];
  if (!uniqueBy(documents, ({ documentId }) => documentId)) {
    approvalError("CONTROLLED_LIVE_DUPLICATE_DOCUMENT_REVIEW");
  }
  const documentReviewById = new Map(documents.map((entry) => [entry.documentId, entry]));
  const corpusDocuments = dataset.corpora.flatMap((corpus) => corpus.documents);
  for (const document of corpusDocuments) {
    const decision = documentReviewById.get(document.id);
    if (decision === undefined) approvalError(`CONTROLLED_LIVE_DOCUMENT_REVIEW_MISSING:${document.id}`);
    if (decision.decision !== "APPROVE") approvalError(`CONTROLLED_LIVE_DOCUMENT_REVIEW_REJECTED:${document.id}`);
    if (decision.fileSha256 !== document.fileSha256) {
      approvalError(`CONTROLLED_LIVE_DOCUMENT_REVIEW_HASH_MISMATCH:${document.id}`);
    }
    if (input.fileHashes?.[document.id] !== undefined && input.fileHashes[document.id] !== document.fileSha256) {
      approvalError(`CONTROLLED_LIVE_DOCUMENT_FILE_HASH_CHANGED:${document.id}`);
    }
  }
  if (documentReviewById.size !== corpusDocuments.length) {
    approvalError("CONTROLLED_LIVE_UNKNOWN_DOCUMENT_REVIEW");
  }

  return parseControlledLiveDataset({
    ...dataset,
    status: "APPROVED",
    approval: {
      reviewerType: "HUMAN",
      reviewerId: review.reviewer.id,
      approvedAt: review.approvedAt,
    },
    cases: dataset.cases.map((entry) => ({
      ...entry,
      annotation: {
        ...entry.annotation,
        reviewer: review.reviewer,
        reviewedAt: decisionByCase.get(entry.id)!.reviewedAt,
      },
    })),
  });
}

async function main() {
  const root = process.cwd();
  const datasetPath = join(root, "evals/press-rag/controlled-live/dataset-v4.draft.json");
  const reviewPath = join(root, "evals/press-rag/controlled-live/review-v4.json");
  const outputPath = join(root, "evals/press-rag/controlled-live/dataset-v4.approved.json");
  const datasetInput = JSON.parse(await readFile(datasetPath, "utf8"));
  const dataset = parseControlledLiveDataset(datasetInput);
  const fileHashes = Object.fromEntries(
    await Promise.all(
      dataset.corpora.flatMap((corpus) => corpus.documents).map(async (document) => [
        document.id,
        createHash("sha256").update(await readFile(join(root, document.filePath))).digest("hex"),
      ]),
    ),
  );
  const approved = approveControlledLiveDataset({
    dataset: datasetInput,
    review: JSON.parse(await readFile(reviewPath, "utf8")),
    fileHashes,
  });
  await writeFile(outputPath, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, contentHash: approved.contentHash })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "CONTROLLED_LIVE_APPROVAL_FAILED"}\n`);
    process.exitCode = 1;
  });
}
