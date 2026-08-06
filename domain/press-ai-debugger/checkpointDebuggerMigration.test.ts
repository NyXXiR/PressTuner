import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../prisma/migrations/20260806120000_press_ai_checkpoint_debugger/migration.sql", import.meta.url), "utf8");
test("checkpoint aggregate owns lineage, order and idempotency constraints", () => { for (const model of ["PressAiDebugCase", "PressAiDebugAttempt", "PressAiDebugCheckpoint", "PressAiDebugTransition", "PressAiDebugGuardrailObservation", "PressAiDebugComparison", "PressAiDebugCommand"]) assert.match(schema, new RegExp(`model ${model}`)); assert.match(schema, /@@unique\(\[attemptId, nodeId\]\)/); assert.match(schema, /@@unique\(\[attemptId, commandId\]\)/); assert.match(migration, /FOREIGN KEY \("baseline_checkpoint_id"\)/); assert.match(migration, /team_id_status_created_at_idx/); });
