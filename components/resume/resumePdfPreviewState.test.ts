import assert from "node:assert/strict";
import test from "node:test";

import { createResumePdfPreviewState, resumePdfPreviewReducer } from "./resumePdfPreviewState";

test("preview generates and accepts only its current attempt", () => {
  const initial = createResumePdfPreviewState();
  assert.deepEqual(initial, { status: "generating", attemptId: 1, pageCount: null, error: null });
  const ready = resumePdfPreviewReducer(initial, { type: "ready", attemptId: 1, pageCount: 3 });
  assert.deepEqual(ready, { status: "ready", attemptId: 1, pageCount: 3, error: null });
  assert.equal(resumePdfPreviewReducer(ready, { type: "error", attemptId: 1, error: "late" }), ready);
});

test("errors and retry create a fresh attempt that rejects stale completion", () => {
  const initial = createResumePdfPreviewState(7);
  const failed = resumePdfPreviewReducer(initial, { type: "error", attemptId: 7, error: "image failed" });
  assert.deepEqual(failed, { status: "error", attemptId: 7, pageCount: null, error: "image failed" });
  const retry = resumePdfPreviewReducer(failed, { type: "retry" });
  assert.deepEqual(retry, { status: "generating", attemptId: 8, pageCount: null, error: null });
  assert.equal(resumePdfPreviewReducer(retry, { type: "ready", attemptId: 7, pageCount: 1 }), retry);
  assert.equal(resumePdfPreviewReducer(retry, { type: "error", attemptId: 7, error: "stale" }), retry);
});

test("retry can replace a ready resource and invalid page counts fail closed", () => {
  const initial = createResumePdfPreviewState();
  const ready = resumePdfPreviewReducer(initial, { type: "ready", attemptId: 1, pageCount: 2 });
  assert.deepEqual(resumePdfPreviewReducer(ready, { type: "retry" }), createResumePdfPreviewState(2));
  const invalid = resumePdfPreviewReducer(initial, { type: "ready", attemptId: 1, pageCount: 0 });
  assert.equal(invalid.status, "error");
  assert.match(invalid.error ?? "", /page/i);
});
