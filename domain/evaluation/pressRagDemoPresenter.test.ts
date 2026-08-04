import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { hashControlledLiveContent } from "./controlledLiveEvaluation";
import {
  PressRagDemoPresentationError,
  presentPressRagDemo,
} from "./pressRagDemoPresenter";

const ROOT = new URL("../../evals/press-rag/controlled-live/", import.meta.url);

async function fixture(name: string) {
  return JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as unknown;
}

async function inputs() {
  return {
    dataset: await fixture("dataset-v4.approved.json"),
    baseline: await fixture("results/baseline-v1.json"),
    candidate: await fixture("results/candidate-v3-optimized.json"),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectCode(code: string, run: () => unknown) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof PressRagDemoPresentationError && error.code === code,
  );
}

test("projects the five deterministic approved presets and recorded repetitions", async () => {
  const view = presentPressRagDemo(await inputs());

  assert.equal(view.evidence.datasetVersion, "press-rag-controlled-live-v4-draft");
  assert.equal(view.evidence.approvedCaseCount, 40);
  assert.match(view.evidence.approvedAt, /^2026-/);
  assert.match(view.evidence.baseline.configurationHash, /^[a-f0-9]{64}$/);
  assert.match(view.evidence.candidate.configurationHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    view.scenarios.map(({ preset, caseId }) => [preset, caseId]),
    [
      ["retrieval", "CL-001"],
      ["grounded-answer", "CL-034"],
      ["abstention", "CL-037"],
      ["conflict", "CL-033"],
      ["safety", "CL-039"],
    ],
  );
  assert.deepEqual(view.scenarios.map(({ runs }) => runs.length), [1, 3, 3, 3, 3]);
  assert.deepEqual(view.scenarios[1]?.runs.map(({ runIndex }) => runIndex), [1, 2, 3]);
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.scenarios[0]?.runs));
});

test("maps only public logical retrieval evidence and preserves recorded outcomes", async () => {
  const view = presentPressRagDemo(await inputs());
  const retrieval = view.scenarios[0]?.runs[0];
  const grounded = view.scenarios[1]?.runs[0];
  const abstention = view.scenarios[2]?.runs[0];

  assert.ok(retrieval);
  assert.equal(retrieval.candidate.retrieval.length, 5);
  assert.equal(retrieval.candidate.retrieval[0]?.logicalDocumentId, "stress-career-01-single-1p");
  assert.equal(retrieval.candidate.retrieval[0]?.expected, true);

  assert.ok(grounded);
  assert.equal(grounded.baseline.status, "FAILED");
  assert.equal(grounded.baseline.errorCode, "PRESS_AGENT_FINAL_CLAIM_VERIFICATION_FAILED");
  assert.equal(grounded.candidate.status, "COMPLETED");
  assert.equal(grounded.candidate.verification.status, "PASS");
  assert.equal(grounded.candidate.fallback.mode, "EXTRACTIVE");
  assert.ok(grounded.candidate.finalAnswer?.includes("PT-CAREER-003"));
  assert.ok(grounded.candidate.citations.length > 0);
  assert.ok(grounded.candidate.latencyMs > 0);
  assert.ok(grounded.candidate.costMicros > 0);

  assert.ok(abstention);
  assert.equal(abstention.candidate.cannotAnswer, true);
  assert.equal(abstention.candidate.verification.mode, "ABSTENTION");
  assert.deepEqual(abstention.candidate.citations, []);
  assert.equal(view.scenarios[2]?.expectation.abstentionReason, "NO_HITS");
});

test("serialized client model excludes raw and internal artifact fields", async () => {
  const serialized = JSON.stringify(presentPressRagDemo(await inputs()));
  const forbiddenKeys = [
    "context",
    "traceId",
    "runtimePolicySnapshot",
    "feedback",
    "indexingStageMetrics",
    "outputSummary",
    "unverifiedFinalOutput",
    "caseRunId",
    "executionId",
    "chunkId",
    "teamId",
    "startedById",
    "reviewerId",
    "author",
  ];
  for (const key of forbiddenKeys) assert.doesNotMatch(serialized, new RegExp(`"${key}"\\s*:`));
  assert.doesNotMatch(serialized, /cms[a-z0-9]{20,}/);
});

test("fails closed with stable artifact and join validation codes", async () => {
  const valid = await inputs();

  const mismatch = clone(valid);
  (mismatch.candidate as { datasetHash: string }).datasetHash = "a".repeat(64);
  expectCode("PRESS_RAG_DEMO_DATASET_HASH_MISMATCH", () => presentPressRagDemo(mismatch));

  const duplicate = clone(valid);
  const duplicateResults = (duplicate.baseline as { results: unknown[] }).results;
  duplicateResults.push(clone(duplicateResults[0]));
  (duplicate.baseline as { totalCostMicros: number }).totalCostMicros += 1;
  expectCode("PRESS_RAG_DEMO_DUPLICATE_RUN", () => presentPressRagDemo(duplicate));

  const unknown = clone(valid);
  ((unknown.baseline as { results: { caseId: string }[] }).results[0]).caseId = "CL-999";
  expectCode("PRESS_RAG_DEMO_UNKNOWN_CASE", () => presentPressRagDemo(unknown));

  const malformedCost = clone(valid);
  (malformedCost.candidate as { results: { costMicros: number }[] }).results[0]!.costMicros = -1;
  expectCode("PRESS_RAG_DEMO_INVALID_COST", () => presentPressRagDemo(malformedCost));

  const missingMap = clone(valid);
  const first = (missingMap.candidate as { results: { result: { documentIdMap: Record<string, string> } }[] }).results[0]!;
  const firstMapKey = Object.keys(first.result.documentIdMap)[0]!;
  delete first.result.documentIdMap[firstMapKey];
  expectCode("PRESS_RAG_DEMO_DOCUMENT_MAPPING_MISSING", () => presentPressRagDemo(missingMap));

  const missingPreset = clone(valid);
  const dataset = missingPreset.dataset as {
    version: string;
    createdAt: string;
    author: unknown;
    corpora: unknown;
    cases: {
      id: string;
      tags: string[];
      expectedAnswerability: "ANSWER" | "ABSTAIN";
      expectedAbstentionReason: string | null;
      annotation: { rationale: string; author: unknown };
    }[];
    partitions: unknown;
    id: string;
    contentHash: string;
  };
  const cases = dataset.cases;
  const safety = cases.find(({ id }) => id === "CL-039")!;
  safety.expectedAnswerability = "ANSWER";
  safety.expectedAbstentionReason = null;
  dataset.contentHash = hashControlledLiveContent({
    version: dataset.version,
    createdAt: dataset.createdAt,
    author: dataset.author,
    corpora: dataset.corpora,
    cases: dataset.cases.map((entry) => ({
      ...entry,
      annotation: {
        rationale: entry.annotation.rationale,
        author: entry.annotation.author,
      },
    })),
    partitions: dataset.partitions,
  });
  dataset.id = `controlled_live_dataset_${dataset.contentHash}`;
  (missingPreset.baseline as { datasetHash: string }).datasetHash = dataset.contentHash;
  (missingPreset.candidate as { datasetHash: string }).datasetHash = dataset.contentHash;
  expectCode("PRESS_RAG_DEMO_MISSING_PRESET:safety", () => presentPressRagDemo(missingPreset));
});
