import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("telemetry route requires team admin and validates bounded query inputs", () => {
  const source = readFileSync("app/api/press/agent/telemetry/runs/[runId]/route.ts", "utf8");
  assert.match(source, /requireTeamContext/); assert.match(source, /isAdmin\(role\)/); assert.match(source, /status: 403/); assert.match(source, /readCanonicalRunTelemetry\(\{ teamId: team\.id, runId/); assert.match(source, /INVALID_QUERY/);
});
