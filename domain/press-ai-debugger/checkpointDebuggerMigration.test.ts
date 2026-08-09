import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../prisma/migrations/20260809120000_contract_transition_debugger/migration.sql", import.meta.url), "utf8");
test("checkpoint aggregate owns repeatable lineage, snapshots and evaluation revisions", () => {
  for (const model of ["PressAiDebugCaseGuardrail", "PressAiDebugCaseCommand", "PressAiDebugEvaluationBatch"]) assert.match(schema, new RegExp(`model ${model}`));
  assert.match(schema, /@@unique\(\[attemptId, nodeId, iteration\]\)/);
  assert.match(schema, /@@unique\(\[attemptId, sequence\]\)/);
  assert.match(schema, /@@unique\(\[transitionId, origin, guardrailId, evaluationRevision\]\)/);
  assert.match(migration, /press-ai-case-topology\/v1/);
  assert.match(migration, /SET "iteration" = 1 WHERE "node_id" = 'selected-rewrite'/);
  assert.match(migration, /terminal-node legacy expectation/);
  assert.match(migration, /ALTER COLUMN "topology_snapshot" SET NOT NULL/);
});
