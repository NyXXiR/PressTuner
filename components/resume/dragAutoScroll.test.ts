import assert from "node:assert/strict";
import test from "node:test";

import { nextReorderScrollTop, reorderAutoScrollVelocity } from "./dragAutoScroll";

test("reorder auto-scroll accelerates toward both edges and stops in the center", () => {
  const bounds = { top: 100, bottom: 500 };

  assert.equal(reorderAutoScrollVelocity(300, bounds), 0);
  assert.ok(reorderAutoScrollVelocity(110, bounds) < reorderAutoScrollVelocity(150, bounds));
  assert.ok(reorderAutoScrollVelocity(490, bounds) > reorderAutoScrollVelocity(450, bounds));
  assert.equal(reorderAutoScrollVelocity(100, bounds), -20);
  assert.equal(reorderAutoScrollVelocity(500, bounds), 20);
});

test("reorder auto-scroll never crosses a scroll container boundary", () => {
  assert.equal(nextReorderScrollTop(4, -20, 300), 0);
  assert.equal(nextReorderScrollTop(290, 20, 300), 300);
  assert.equal(nextReorderScrollTop(120, 8, 300), 128);
});
