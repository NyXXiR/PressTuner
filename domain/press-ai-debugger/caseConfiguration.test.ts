import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_PRESS_AI_CASE_TOPOLOGY, LEGACY_PRESS_AI_CASE_TOPOLOGY, PressAiCaseTopologySchema, PressAiGuardrailSnapshotSchema, rebasePressAiArticleReferences } from "./caseConfiguration";

test("new and historical topology defaults are distinct immutable snapshots", () => {
  assert.equal(DEFAULT_PRESS_AI_CASE_TOPOLOGY.enabledEdgeIds.length, 5);
  assert.equal(DEFAULT_PRESS_AI_CASE_TOPOLOGY.maxIterations, 3);
  assert.equal(LEGACY_PRESS_AI_CASE_TOPOLOGY.enabledEdgeIds.length, 4);
  assert.equal(LEGACY_PRESS_AI_CASE_TOPOLOGY.enabledEdgeIds.includes("rewrite-review"), false);
});

test("saved-case rerun recursively rebases article ids in keys, arrays, and nested checkpoints", () => {
  const value = { articleId: "article-old", context: ["article-old", { nested: "article-old" }], "article-old": { restored: "article-old" }, untouched: "article-old-suffix" };
  assert.deepEqual(rebasePressAiArticleReferences(value, "article-old", "article-new"), { articleId: "article-new", context: ["article-new", { nested: "article-new" }], "article-new": { restored: "article-new" }, untouched: "article-old-suffix" });
});

test("topology is strict, catalog-bound and capped from one through five", () => {
  for (const maxIterations of [1, 2, 3, 4, 5]) assert.equal(PressAiCaseTopologySchema.parse({ ...DEFAULT_PRESS_AI_CASE_TOPOLOGY, maxIterations }).maxIterations, maxIterations);
  assert.throws(() => PressAiCaseTopologySchema.parse({ ...DEFAULT_PRESS_AI_CASE_TOPOLOGY, maxIterations: 0 }));
  assert.throws(() => PressAiCaseTopologySchema.parse({ ...DEFAULT_PRESS_AI_CASE_TOPOLOGY, maxIterations: 6 }));
  assert.throws(() => PressAiCaseTopologySchema.parse({ ...DEFAULT_PRESS_AI_CASE_TOPOLOGY, enabledEdgeIds: ["invented"] }));
});

test("guardrail snapshots require edge-scoped evaluator identity and severity", () => {
  assert.equal(PressAiGuardrailSnapshotSchema.parse([{ id: "g1", edgeId: "draft-review", instruction: "사실을 보존한다", severity: "BLOCK", evaluatorId: "semantic-guardrail", evaluatorVersion: "1", displayOrder: 0 }]).length, 1);
  assert.throws(() => PressAiGuardrailSnapshotSchema.parse([{ id: "g1", edgeId: "draft-review", instruction: "x", severity: "PASS", evaluatorId: "semantic-guardrail", evaluatorVersion: "1", displayOrder: 0 }]));
});
