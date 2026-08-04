import assert from "node:assert/strict";
import test from "node:test";

import { identifyAgentConfiguration, sha256Canonical } from "./configurationIdentity";
import { DeterministicPressRagExecutor } from "./deterministicPressRagExecutor";
import { evaluateAgentExperiment } from "./experimentEvaluation";
import { runAgentExperiment } from "./experimentRunner";

const identity = {
  parser: { version: "pa" }, model: { version: "m" }, prompt: { version: "p" }, embedding: { version: "e" },
  chunking: { version: "c" }, queryTransformation: { version: "qt" }, retrieval: { version: "r" }, reranking: { version: "rr" },
  contextPacking: { version: "cp" }, toolset: { version: "t" }, runtimePolicy: { version: "rp" }, verifier: { version: "v" }, evaluator: { version: "ev" },
};
const cases = Array.from({ length: 30 }, (_, index) => ({
  id: `case-${index}`,
  question: "q",
  expectedBehavior: { expectedDocumentIds: ["doc"], scenario: "normal" },
}));
const datasetBody = { version: "v", cases };
const environmentBody = {
  executorId: "press-rag-deterministic/v1",
  seed: 20260803,
  frozenAt: "2026-08-03T00:00:00.000Z",
};

test("deterministic experiment produces evaluable synthetic metrics but still awaits review", async () => {
  const artifact = await runAgentExperiment({
    executor: new DeterministicPressRagExecutor(),
    baseline: identifyAgentConfiguration(identity),
    candidate: identifyAgentConfiguration({ ...identity, prompt: { version: "p2" } }),
    dataset: { id: "d", ...datasetBody, contentHash: sha256Canonical(datasetBody) },
    environment: { id: "e", ...environmentBody, contentHash: sha256Canonical(environmentBody) },
  });
  const pending = evaluateAgentExperiment(artifact);
  assert.equal(pending.evidenceClass, "synthetic");
  assert.equal(pending.checks.some(({ status }) => status === "NOT_EVALUABLE"), false);
  assert.equal(pending.disposition, "NOT_EVALUABLE");
  assert.equal(evaluateAgentExperiment(artifact, "APPROVED").disposition, "PROMOTE");
});
