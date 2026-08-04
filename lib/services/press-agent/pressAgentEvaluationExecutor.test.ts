import assert from "node:assert/strict";
import test from "node:test";

import { identifyAgentConfiguration, sha256Canonical } from "@/domain/evaluation/configurationIdentity";
import { PressAgentEvaluationExecutor } from "./pressAgentEvaluationExecutor";

const identity = {
  parser: { version: "pa" }, model: { version: "m" }, prompt: { version: "p" }, embedding: { version: "e" },
  chunking: { version: "c" }, queryTransformation: { version: "qt" }, retrieval: { version: "r" }, reranking: { version: "rr" },
  contextPacking: { version: "cp" }, toolset: { version: "t" }, runtimePolicy: { version: "rp" }, verifier: { version: "v" }, evaluator: { version: "ev" },
};
const cases = [{ id: "case", question: "q", expectedBehavior: {} }];
const datasetBody = { version: "v", cases };
const environmentBody = { executorId: "press-agent-production/v1", seed: 1, frozenAt: "2026-08-03T00:00:00Z" };
const request = {
  role: "baseline" as const,
  configuration: identifyAgentConfiguration(identity),
  dataset: { id: "d", ...datasetBody, contentHash: sha256Canonical(datasetBody) },
  environment: { id: "e", ...environmentBody, contentHash: sha256Canonical(environmentBody) },
};

test("production adapter satisfies the executor contract with measured evidence", async () => {
  const executor = new PressAgentEvaluationExecutor(async () => ({ observations: { taskSuccess: { evidenceClass: "measured", value: true } } }));
  const result = await executor.execute(request);
  assert.equal(result.outcomes[0].executionId, result.id);
  assert.equal(result.outcomes[0].observations.taskSuccess.evidenceClass, "measured");
});

test("production adapter cannot mislabel evidence as synthetic", async () => {
  const executor = new PressAgentEvaluationExecutor(async () => ({ observations: { taskSuccess: { evidenceClass: "synthetic", value: true } } }));
  await assert.rejects(executor.execute(request), /CANNOT_EMIT_SYNTHETIC/);
});
