import assert from "node:assert/strict";
import test from "node:test";

import { resolvePressRagWorkflowNavigationIndex } from "./pressRagWorkflowNavigation";

test("arrow navigation moves in both axes and wraps", () => {
  assert.equal(resolvePressRagWorkflowNavigationIndex("ArrowRight", 2, 7), 3);
  assert.equal(resolvePressRagWorkflowNavigationIndex("ArrowDown", 6, 7), 0);
  assert.equal(resolvePressRagWorkflowNavigationIndex("ArrowLeft", 2, 7), 1);
  assert.equal(resolvePressRagWorkflowNavigationIndex("ArrowUp", 0, 7), 6);
});

test("Home and End select workflow boundaries", () => {
  assert.equal(resolvePressRagWorkflowNavigationIndex("Home", 4, 7), 0);
  assert.equal(resolvePressRagWorkflowNavigationIndex("End", 1, 7), 6);
});

test("unrelated keys, Enter, and Space remain native button behavior", () => {
  for (const key of ["Escape", "Tab", "Enter", " "]) {
    assert.equal(resolvePressRagWorkflowNavigationIndex(key, 3, 7), 3);
  }
});
