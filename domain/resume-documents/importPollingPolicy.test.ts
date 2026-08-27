import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_IMPORT_POLL_DELAY_MS,
  canLoadImportCandidates,
  nextImportPollDelay,
  shouldPollImport,
  type ImportStatus,
} from "./importPollingPolicy";

test("processing statuses poll unless the source failed", () => {
  for (const status of ["WAITING_SOURCE", "QUEUED", "EXTRACTING"] satisfies ImportStatus[]) {
    assert.equal(shouldPollImport(status, "READY"), true);
    assert.equal(shouldPollImport(status, "FAILED"), false);
  }
});

test("terminal statuses stop polling and only reviewable statuses load candidates", () => {
  for (const status of ["REVIEW_REQUIRED", "COMPLETE", "FAILED"] satisfies ImportStatus[]) {
    assert.equal(shouldPollImport(status, "READY"), false);
  }
  assert.equal(canLoadImportCandidates("REVIEW_REQUIRED"), true);
  assert.equal(canLoadImportCandidates("COMPLETE"), true);
  for (const status of ["WAITING_SOURCE", "QUEUED", "EXTRACTING", "FAILED"] satisfies ImportStatus[]) {
    assert.equal(canLoadImportCandidates(status), false);
  }
});

test("poll delay follows the exact bounded sequence and caps at 30 seconds", () => {
  const delays = [INITIAL_IMPORT_POLL_DELAY_MS];
  for (let index = 0; index < 6; index += 1) {
    delays.push(nextImportPollDelay(delays.at(-1)!, "EXTRACTING", "EXTRACTING"));
  }
  assert.deepEqual(delays, [2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
});

test("a forward status transition resets the delay while regressions do not", () => {
  assert.equal(nextImportPollDelay(16_000, "QUEUED", "EXTRACTING"), 2_000);
  assert.equal(nextImportPollDelay(16_000, "EXTRACTING", "QUEUED"), 30_000);
  assert.equal(nextImportPollDelay(16_000, "QUEUED", "QUEUED"), 30_000);
});
