import assert from "node:assert/strict";
import test from "node:test";

import { identifyAgentConfiguration, sha256Canonical } from "./configurationIdentity";
import { DeterministicPressRagExecutor } from "./deterministicPressRagExecutor";
import { createAgentExperimentCycleEvidence, parseAgentExperimentCycleEvidence } from "./experimentCycleEvidence";
import { runAgentExperiment } from "./experimentRunner";

const identity = {
  parser: { version: "pa" }, model: { version: "m" }, prompt: { version: "p" }, embedding: { version: "e" },
  chunking: { version: "c" }, queryTransformation: { version: "qt" }, retrieval: { version: "r" }, reranking: { version: "rr" },
  contextPacking: { version: "cp" }, toolset: { version: "t" }, runtimePolicy: { version: "rp" }, verifier: { version: "v" }, evaluator: { version: "ev" },
};

test("cycle evidence binds executions, gates, review state, and a canonical hash", async () => {
  const cases = [{ id: "case", question: "q", expectedBehavior: {} }];
  const datasetBody = { version: "v", cases };
  const environmentBody = { executorId: "press-rag-deterministic/v1", seed: 1, frozenAt: "2026-08-03T00:00:00.000Z" };
  const experiment = await runAgentExperiment({
    executor: new DeterministicPressRagExecutor(),
    baseline: identifyAgentConfiguration(identity),
    candidate: identifyAgentConfiguration({ ...identity, prompt: { version: "p2" } }),
    dataset: { id: "d", ...datasetBody, contentHash: sha256Canonical(datasetBody) },
    environment: { id: "e", ...environmentBody, contentHash: sha256Canonical(environmentBody) },
  });
  const evidence = createAgentExperimentCycleEvidence({ cycleId: "cycle-1", sequence: 1, experiment });
  assert.deepEqual(parseAgentExperimentCycleEvidence(evidence), evidence);
  const tampered = { ...evidence, sequence: 2 };
  assert.throws(() => parseAgentExperimentCycleEvidence(tampered), /HASH_MISMATCH/);
});
