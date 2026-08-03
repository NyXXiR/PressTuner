import assert from "node:assert/strict";
import test from "node:test";

import { identifyAgentConfiguration, sha256Canonical } from "./configurationIdentity";
import { DeterministicPressRagExecutor } from "./deterministicPressRagExecutor";
import type { EvaluationExecutor } from "./evaluationExecutor";
import {
  parseAgentExperimentArtifact,
  parseExperimentDataset,
} from "./experimentContracts";
import { runAgentExperiment } from "./experimentRunner";

const identity = {
  model: { version: "model/v1" },
  prompt: { version: "prompt/v1" },
  embedding: { version: "embedding/v1" },
  chunking: { version: "chunking/v1" },
  retrieval: { version: "retrieval/v1" },
  reranking: { version: "reranking/v1" },
  toolset: { version: "toolset/v1" },
  runtimePolicy: { version: "runtime/v1" },
  evaluator: { version: "evaluator/v1" },
};
const cases = [
  { id: "case-1", question: "q", expectedBehavior: { effect: "READ" } },
];
const dataset = {
  id: "dataset-v3",
  version: "press-rag-v3",
  cases,
  contentHash: sha256Canonical({ version: "press-rag-v3", cases }),
};
const environmentBody = {
  executorId: "press-rag-deterministic/v1",
  seed: 42,
  frozenAt: "2026-08-03T00:00:00.000Z",
};
const environment = {
  id: "deterministic-v1",
  ...environmentBody,
  contentHash: sha256Canonical(environmentBody),
};

test("dataset rejects duplicate case IDs and mismatched hashes", () => {
  assert.throws(
    () => parseExperimentDataset({ ...dataset, cases: [...cases, ...cases] }),
    /DUPLICATE_CASE_ID/,
  );
  assert.throws(
    () => parseExperimentDataset({ ...dataset, contentHash: "0".repeat(64) }),
    /DATASET_HASH_MISMATCH/,
  );
});

test("runner executes both roles separately with the same frozen environment instance", async () => {
  const delegate = new DeterministicPressRagExecutor();
  const calls: Parameters<EvaluationExecutor["execute"]>[0][] = [];
  const executor: EvaluationExecutor = {
    id: delegate.id,
    async execute(request) {
      calls.push(request);
      return delegate.execute(request);
    },
  };
  const artifact = await runAgentExperiment({
    executor,
    baseline: identifyAgentConfiguration(identity),
    candidate: identifyAgentConfiguration({
      ...identity,
      prompt: { version: "prompt/v2" },
    }),
    dataset,
    environment,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].role, "baseline");
  assert.equal(calls[1].role, "candidate");
  assert.equal(calls[0].environment, calls[1].environment);
  assert.notEqual(artifact.executions.baseline.id, artifact.executions.candidate.id);
  assert.deepEqual(parseAgentExperimentArtifact(artifact), artifact);
});

test("deterministic artifact is byte-identical and copied provenance is rejected", async () => {
  const args = {
    executor: new DeterministicPressRagExecutor(),
    baseline: identifyAgentConfiguration(identity),
    candidate: identifyAgentConfiguration({
      ...identity,
      prompt: { version: "prompt/v2" },
    }),
    dataset,
    environment,
  };
  const first = await runAgentExperiment(args);
  const second = await runAgentExperiment(args);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const copied = structuredClone(first);
  copied.executions.candidate = structuredClone(first.executions.baseline) as typeof copied.executions.candidate;
  assert.throws(() => parseAgentExperimentArtifact(copied));

  const missingCase = structuredClone(first);
  missingCase.executions.candidate.outcomes[0].caseId = "different-case";
  missingCase.artifactHash = sha256Canonical((({ artifactHash: _hash, ...body }) => body)(missingCase));
  assert.throws(
    () => parseAgentExperimentArtifact(missingCase),
    /EXECUTION_CASES_MUST_MATCH/,
  );
});
