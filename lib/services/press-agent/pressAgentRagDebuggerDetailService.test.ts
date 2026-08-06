import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("detail lookup scopes debugger runs by id, team, starter, and launch surface", () => {
  const source = readFileSync(join(__dirname, "pressAgentRagDebuggerDetailService.ts"), "utf8");
  for (const scope of ["id: args.runId", "teamId: args.teamId", "startedById: args.userId", "PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE"]) assert.match(source, new RegExp(scope.replace(".", "\\.")));
  assert.match(source, /PressAgentRagDebuggerDetailNotFoundError/);
  assert.doesNotMatch(source, /agentStep/);
});
