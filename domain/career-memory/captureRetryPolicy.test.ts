import assert from "node:assert/strict";
import test from "node:test";

import {
  canAutomaticallyClaimCareerCapture,
  doesCareerCaptureBlockDone,
  isCurrentCareerCaptureSnapshot,
  nextCareerCaptureAttemptAt,
} from "./captureRetryPolicy";

test("career capture retries use one and five minute delays then stop", () => {
  const now = new Date("2026-07-27T00:00:00.000Z");
  assert.equal(nextCareerCaptureAttemptAt(1, now)?.toISOString(), "2026-07-27T00:01:00.000Z");
  assert.equal(nextCareerCaptureAttemptAt(2, now)?.toISOString(), "2026-07-27T00:05:00.000Z");
  assert.equal(nextCareerCaptureAttemptAt(3, now), null);
});

test("automatic claims are due, bounded, and reclaim expired leases", () => {
  const now = new Date("2026-07-27T00:05:00.000Z");
  assert.equal(canAutomaticallyClaimCareerCapture({
    status: "PENDING", attemptCount: 2, nextAttemptAt: now, leaseExpiresAt: null, now,
  }), true);
  assert.equal(canAutomaticallyClaimCareerCapture({
    status: "PENDING", attemptCount: 3, nextAttemptAt: now, leaseExpiresAt: null, now,
  }), false);
  assert.equal(canAutomaticallyClaimCareerCapture({
    status: "PROCESSING", attemptCount: 1, nextAttemptAt: null,
    leaseExpiresAt: new Date(now.getTime() - 1), now,
  }), true);
});

test("snapshot validation includes ownership, completion, identity, hash, and revision", () => {
  const snapshot = {
    userId: "user", applicationId: "app", questionId: "question",
    answerHash: "hash", answerRevision: 2,
  };
  assert.equal(isCurrentCareerCaptureSnapshot(snapshot, { ...snapshot, isCompleted: true }), true);
  assert.equal(isCurrentCareerCaptureSnapshot(snapshot, {
    ...snapshot, answerRevision: 3, isCompleted: true,
  }), false);
  assert.equal(isCurrentCareerCaptureSnapshot(snapshot, { ...snapshot, isCompleted: false }), false);
});

test("unresolved capture tasks block DONE until success or explicit skip", () => {
  assert.equal(doesCareerCaptureBlockDone("PROCESSING"), true);
  assert.equal(doesCareerCaptureBlockDone("PENDING"), true);
  assert.equal(doesCareerCaptureBlockDone("FAILED"), true);
  assert.equal(doesCareerCaptureBlockDone("SUCCEEDED"), false);
  assert.equal(doesCareerCaptureBlockDone("SKIPPED"), false);
});
