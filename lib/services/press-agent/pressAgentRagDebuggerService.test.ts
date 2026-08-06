import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("debugger orchestration uses exactly the existing Press quota action and launch surface", () => {
  const source = readFileSync(join(__dirname, "pressAgentRagDebuggerService.ts"), "utf8");
  assert.equal((source.match(/action: "press_panel_chat"/g) ?? []).length, 1);
  assert.match(source, /launchSurface: "RAG_DEBUGGER_V1"/);
  assert.match(source, /workflowObserver: args\.observer/);
  assert.doesNotMatch(source, /setTimeout|setImmediate|queueMicrotask/);
});
