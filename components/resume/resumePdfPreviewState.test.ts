import assert from "node:assert/strict";
import test from "node:test";

import {
  createResumePdfPreviewState,
  resumePdfPreviewReducer,
} from "./resumePdfPreviewState";

test("preview opens in loading and accepts only its current pagination result", () => {
  const initial = createResumePdfPreviewState();
  assert.deepEqual(initial, { status: "loading", generation: 1, pageCount: null, error: null });

  const ready = resumePdfPreviewReducer(initial, { type: "ready", generation: 1, pageCount: 3 });
  assert.deepEqual(ready, { status: "ready", generation: 1, pageCount: 3, error: null });
  assert.equal(resumePdfPreviewReducer(ready, { type: "error", generation: 1, error: "late" }), ready);
});

test("preview exposes errors and retry starts a fresh loading generation", () => {
  const initial = createResumePdfPreviewState(7);
  const failed = resumePdfPreviewReducer(initial, { type: "error", generation: 7, error: "image failed" });
  assert.deepEqual(failed, { status: "error", generation: 7, pageCount: null, error: "image failed" });

  const retry = resumePdfPreviewReducer(failed, { type: "retry" });
  assert.deepEqual(retry, { status: "loading", generation: 8, pageCount: null, error: null });
  assert.equal(resumePdfPreviewReducer(retry, { type: "ready", generation: 7, pageCount: 1 }), retry);
  assert.equal(resumePdfPreviewReducer(retry, { type: "error", generation: 7, error: "stale" }), retry);
});

test("printing is allowed only from ready and retains the generated page count", () => {
  const loading = createResumePdfPreviewState();
  assert.equal(resumePdfPreviewReducer(loading, { type: "print" }), loading);

  const ready = resumePdfPreviewReducer(loading, { type: "ready", generation: 1, pageCount: 2 });
  const printing = resumePdfPreviewReducer(ready, { type: "print" });
  assert.deepEqual(printing, { ...ready, status: "printing" });
  assert.equal(resumePdfPreviewReducer(printing, { type: "retry" }), printing);

  const restored = resumePdfPreviewReducer(printing, { type: "print-finished" });
  assert.deepEqual(restored, ready);
  assert.equal(resumePdfPreviewReducer(restored, { type: "print-finished" }), restored);
});

test("invalid or empty ready results fail closed", () => {
  const initial = createResumePdfPreviewState();
  const invalid = resumePdfPreviewReducer(initial, { type: "ready", generation: 1, pageCount: 0 });
  assert.equal(invalid.status, "error");
  assert.match(invalid.error ?? "", /page/i);
});
