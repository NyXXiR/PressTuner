import assert from "node:assert/strict";
import test from "node:test";

import { feedbackRegressionSignals } from "./feedbackRegressionSignals";

test("negative feedback becomes stable review candidates while positive feedback does not", () => {
  const input = {
    runId: "run-1",
    teamId: "team-1",
    userId: "user-1",
    input: { request: "Draft a product release" },
    output: { title: "Release" },
    sourceIds: ["source-b", "source-a", "source-a"],
    usefulness: "NEGATIVE" as const,
    citationAccuracy: "NEGATIVE" as const,
  };
  const first = feedbackRegressionSignals(input);
  const second = feedbackRegressionSignals(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ sourceKind }) => sourceKind), [
    "negative_feedback",
    "citation_accuracy",
  ]);
  assert.deepEqual(first[0].logicalSourceRefs, ["source-a", "source-b"]);
  assert.equal(first[0].failureCategory, "UNKNOWN");
  assert.equal(first[1].failureCategory, "UNSUPPORTED_CITATION");
  assert.deepEqual(
    feedbackRegressionSignals({ ...input, usefulness: "POSITIVE", citationAccuracy: null }),
    [],
  );
});
