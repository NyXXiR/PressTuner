import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createResumeWriteFlowState,
  resumeWriteFlowReducer,
  type ResumeWriteFlowState,
} from "./flowMachine";
import {
  parseResumeWriteFlowState,
  resumeWriteFlowStorageKey,
  serializeResumeWriteFlowState,
} from "./flowPersistence";

test("round trips a resume write flow session", () => {
  // Given
  const state = createResumeWriteFlowState();

  // When
  const restored = parseResumeWriteFlowState(
    serializeResumeWriteFlowState(state),
  );

  // Then
  assert.deepEqual(restored, state);
});

test("normalizes in-flight statuses so a restored session is actionable", () => {
  // Given
  const pending: ResumeWriteFlowState = resumeWriteFlowReducer(
    resumeWriteFlowReducer(createResumeWriteFlowState(), {
      type: "update_intake",
      field: "rawText",
      value: "공고 원문",
    }),
    { type: "organize_started" },
  );

  // When
  const restored = parseResumeWriteFlowState(
    serializeResumeWriteFlowState(pending),
  );

  // Then
  assert.equal(restored?.organize.status, "idle");
  assert.equal(restored?.intake.rawText, "공고 원문");
});

test("rejects malformed persisted flow state", () => {
  // Given
  const malformed = JSON.stringify({ stage: "unknown", questions: [] });

  // When / Then
  assert.equal(parseResumeWriteFlowState(malformed), null);
  assert.equal(parseResumeWriteFlowState("not-json"), null);
});

test("scopes the storage key by application id", () => {
  assert.notEqual(resumeWriteFlowStorageKey(null), resumeWriteFlowStorageKey("app-1"));
  assert.equal(resumeWriteFlowStorageKey("app-1"), resumeWriteFlowStorageKey("app-1"));
});

test("restores deferred capture tasks while clearing an in-flight retry", () => {
  const state: ResumeWriteFlowState = {
    ...createResumeWriteFlowState(),
    deferredCaptures: [
      {
        taskId: "task-1",
        questionId: "question-1",
        status: "retrying",
        attemptCount: 1,
        nextRetryAt: "2026-07-27T01:00:00.000Z",
        lastErrorCode: "EXTRACTION_UNAVAILABLE",
        requiresReopen: false,
        retryStatus: "pending",
        error: null,
      },
    ],
  };
  const restored = parseResumeWriteFlowState(serializeResumeWriteFlowState(state));
  assert.equal(restored?.schemaVersion, 3);
  assert.equal(restored?.deferredCaptures[0]?.taskId, "task-1");
  assert.equal(restored?.deferredCaptures[0]?.retryStatus, "idle");
});
