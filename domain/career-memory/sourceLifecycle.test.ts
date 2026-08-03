import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCareerSourceTransition,
  canRetryCareerSource,
  isCareerSourceBusy,
} from "./sourceLifecycle";

test("career source lifecycle accepts the worker sequence and retry", () => {
  const sequence = [
    ["UPLOADED", "QUEUED"],
    ["QUEUED", "PARSING"],
    ["PARSING", "INDEXING"],
    ["INDEXING", "EXTRACTING"],
    ["EXTRACTING", "READY"],
    ["FAILED", "QUEUED"],
  ] as const;

  for (const [from, to] of sequence) {
    assert.doesNotThrow(() => assertCareerSourceTransition(from, to));
  }
  assert.equal(canRetryCareerSource("FAILED"), true);
  assert.equal(canRetryCareerSource("READY"), false);
  assert.equal(isCareerSourceBusy("INDEXING"), true);
  assert.equal(isCareerSourceBusy("READY"), false);
});

test("career source lifecycle rejects stale or regressive transitions", () => {
  assert.throws(
    () => assertCareerSourceTransition("READY", "PARSING"),
    /Invalid career source transition/,
  );
  assert.throws(
    () => assertCareerSourceTransition("PARSING", "READY"),
    /Invalid career source transition/,
  );
});
