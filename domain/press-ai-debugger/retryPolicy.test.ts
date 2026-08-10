import assert from "node:assert/strict";
import test from "node:test";

import {
  getBeginningRetryNodeId,
  getCompletedRetryCheckpoints,
  isRetryNodeValid,
} from "./retryPolicy";

const checkpoint = (
  nodeId: string,
  sequence: number,
  mode: "EXECUTED" | "RESTORED" = "EXECUTED",
) => ({ id: `${nodeId}-${sequence}-${mode}`, nodeId, sequence, mode });

test("completed retry choices are registry ordered, unique, and registry valid", () => {
  const choices = getCompletedRetryCheckpoints({
    checkpoints: [
      checkpoint("draft-review", 50, "RESTORED"),
      checkpoint("unknown-node", 0),
      checkpoint("brief-normalization", 99),
      checkpoint("draft-review", 3),
      checkpoint("article-initialization", 40),
    ],
  });

  assert.deepEqual(
    choices.map(({ nodeId, sequence }) => ({ nodeId, sequence })),
    [
      { nodeId: "article-initialization", sequence: 0 },
      { nodeId: "brief-normalization", sequence: 1 },
      { nodeId: "draft-review", sequence: 3 },
    ],
  );
  assert.equal(choices.find((item) => item.nodeId === "draft-review")?.mode, "RESTORED");
});

test("from beginning uses the earliest completed checkpoint", () => {
  assert.equal(
    getBeginningRetryNodeId({
      checkpoints: [checkpoint("draft-generation", 2), checkpoint("brief-normalization", 1)],
    }),
    "brief-normalization",
  );
});

test("an attempt with zero checkpoints can restart only at the first registry node", () => {
  const attempt = { checkpoints: [] };
  assert.equal(getBeginningRetryNodeId(attempt), "article-initialization");
  assert.equal(isRetryNodeValid(attempt, "article-initialization"), true);
  assert.equal(isRetryNodeValid(attempt, "brief-normalization"), false);
  assert.equal(isRetryNodeValid(attempt, "unknown-node"), false);
});

test("both executed and restored persisted checkpoints are valid branch points", () => {
  const attempt = {
    checkpoints: [
      checkpoint("article-initialization", 0, "RESTORED"),
      checkpoint("brief-normalization", 1, "EXECUTED"),
    ],
  };
  assert.equal(isRetryNodeValid(attempt, "article-initialization"), true);
  assert.equal(isRetryNodeValid(attempt, "brief-normalization"), true);
  assert.equal(isRetryNodeValid(attempt, "draft-generation"), false);
});

test("retry availability is independent of attempt status", () => {
  for (const status of ["ACTIVE", "INSPECTING", "BLOCKED", "FAILED", "COMPLETED"] as const) {
    const attempt = {
      status,
      checkpoints: [checkpoint("article-initialization", 0)],
    };
    assert.equal(getBeginningRetryNodeId(attempt), "article-initialization");
    assert.equal(isRetryNodeValid(attempt, "article-initialization"), true);
  }
});
