import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("canonical telemetry migration is nullable and indexed without changing legacy columns", () => {
  const sql = readFileSync("prisma/migrations/20260806130000_canonical_ai_telemetry/migration.sql", "utf8");
  for (const column of ["schema_version", "canonical_event_id", "trace_id", "span_id", "parent_span_id", "sequence", "event_kind"]) assert.match(sql, new RegExp(`ADD COLUMN \\"${column}\\"`));
  assert.match(sql, /UNIQUE INDEX/); assert.match(sql, /team_id.*trace_id.*sequence/); assert.match(sql, /team_id.*run_id.*sequence/); assert.doesNotMatch(sql, /NOT NULL/);
});
