import assert from "node:assert/strict";
import test from "node:test";

import { buildControlledLiveCostPlan } from "./controlledLiveCostPlan";

const dataset = {
  contentHash: "d".repeat(64),
  cases: [{ id: "case", kind: "RETRIEVAL_ONLY", prompt: "q" }],
} as never;
const configuration = {
  id: "baseline-v1", queryTransformation: "NORMALIZE", reranker: "NONE",
} as never;

test("execution-only cost plans do not reserve the separate semantic-judge budget", () => {
  const complete = buildControlledLiveCostPlan({ dataset, configurations: [configuration], agentRunCount: 3, corpusFiles: [], includeSemanticJudge: true });
  const execution = buildControlledLiveCostPlan({ dataset, configurations: [configuration], agentRunCount: 3, corpusFiles: [], includeSemanticJudge: false });
  assert.equal(complete.calls.semanticJudge, 30);
  assert.equal(execution.calls.semanticJudge, 0);
  assert.equal(complete.hardCeilingCostMicros - execution.hardCeilingCostMicros, complete.components.semanticJudge.hardCeilingCostMicros);
});
