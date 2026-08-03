import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createResumeWritingLabState } from "./labMachine";
import {
  parseResumeWritingLabState,
  serializeResumeWritingLabState,
} from "./labPersistence";

test("round trips a local resume writing session", () => {
  // Given
  const state = createResumeWritingLabState();

  // When
  const restored = parseResumeWritingLabState(
    serializeResumeWritingLabState(state),
  );

  // Then
  assert.deepEqual(restored, state);
});

test("rejects malformed local resume writing state", () => {
  // Given
  const malformed = JSON.stringify({ stage: "unknown", questions: [] });

  // When
  const restored = parseResumeWritingLabState(malformed);

  // Then
  assert.equal(restored, null);
});
