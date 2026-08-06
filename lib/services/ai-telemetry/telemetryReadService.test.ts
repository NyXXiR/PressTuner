import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("telemetry reads are team/run scoped, bounded, ordered and projected", () => {
  const source = readFileSync("lib/services/ai-telemetry/telemetryReadService.ts", "utf8");
  assert.match(source, /teamId: args\.teamId, runId: args\.runId/); assert.match(source, /Math\.min\(200/); assert.match(source, /sequence: "asc"/); assert.match(source, /projectCanonicalEventToOpsConsole/); assert.match(source, /summaries/); assert.match(source, /evaluations/); assert.match(source, /approvals/); assert.match(source, /experiments/); assert.match(source, /malformedRows/); assert.doesNotMatch(source, /details,?\s*events/);
});
