import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("debugger validates the effective document lifecycle before using exactly the existing quota action", () => {
  const source = readFileSync(join(__dirname, "pressAgentRagDebuggerService.ts"), "utf8");
  assert.equal((source.match(/action: "press_panel_chat"/g) ?? []).length, 1);
  assert.match(source, /launchSurface: "RAG_DEBUGGER_V1"/);
  assert.match(source, /workflowObserver: args\.observer/);
  assert.ok(source.indexOf("knowledgeDocument.findMany") < source.indexOf("await consumeAiQuota"));
  for (const predicate of ["teamId: args.teamId", "deletedAt: null", 'status: "READY"', "replacementDocument: null", "activeGenerationId", "chunkCount: { gt: 0 }"]) assert.match(source, new RegExp(predicate.replace(/[{}]/g, "\\$&")));
  assert.doesNotMatch(source, /setTimeout|setImmediate|queueMicrotask/);
});
