import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneJsonSnapshot,
  diffJsonSnapshots,
} from "./pressPlaygroundTrace";

test("snapshot cloning is JSON-safe and detached", () => {
  const source = {
    createdAt: new Date("2026-07-28T00:00:00.000Z"),
    omitted: undefined,
    nested: [{ value: 1 }],
  };
  const snapshot = cloneJsonSnapshot(source);
  source.nested[0].value = 2;
  assert.deepEqual(snapshot, {
    createdAt: "2026-07-28T00:00:00.000Z",
    nested: [{ value: 1 }],
  });
});
test("diffs nested objects and arrays with stable readable paths", () => {
  assert.deepEqual(
    diffJsonSnapshots(
      {
        article: { status: "DRAFT" },
        brief: { points: ["one", "removed"] },
        verification: { freshness: "STALE" },
      },
      {
        article: { status: "IN_PROGRESS" },
        brief: { points: ["changed", "added"], serviceName: "Save It" },
        grounding: { facts: [] },
        verification: { freshness: "CURRENT" },
      },
    ),
    [
      {
        path: "article.status",
        kind: "changed",
        before: "DRAFT",
        after: "IN_PROGRESS",
      },
      {
        path: "brief.points[0]",
        kind: "changed",
        before: "one",
        after: "changed",
      },
      {
        path: "brief.points[1]",
        kind: "changed",
        before: "removed",
        after: "added",
      },
      {
        path: "brief.serviceName",
        kind: "added",
        before: undefined,
        after: "Save It",
      },
      {
        path: "grounding",
        kind: "added",
        before: undefined,
        after: { facts: [] },
      },
      {
        path: "verification.freshness",
        kind: "changed",
        before: "STALE",
        after: "CURRENT",
      },
    ],
  );
});

test("reports array additions and removals and omits unchanged state", () => {
  assert.deepEqual(diffJsonSnapshots({ items: [1] }, { items: [1, 2] }), [
    {
      path: "items[1]",
      kind: "added",
      before: undefined,
      after: 2,
    },
  ]);
  assert.deepEqual(diffJsonSnapshots({ items: [1, 2] }, { items: [1] }), [
    {
      path: "items[1]",
      kind: "removed",
      before: 2,
      after: undefined,
    },
  ]);
  assert.deepEqual(diffJsonSnapshots({ same: true }, { same: true }), []);
});
