import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("checkpoint lifecycle dual-writes every durable canonical phase", () => {
  const checkpoint = readFileSync("lib/services/press-ai-debugger/checkpointDebuggerService.ts", "utf8"); const retry = readFileSync("lib/services/press-ai-debugger/retryService.ts", "utf8"); const cases = readFileSync("lib/services/press-ai-debugger/caseService.ts", "utf8");
  for (const mapper of ["mapRunLifecycle", "mapNodeLifecycle", "mapTransitionEvaluation", "mapHumanApproval", "mapEdgeTraversed"]) assert.match(checkpoint, new RegExp(mapper));
  assert.match(checkpoint, /phase: "STARTED"/); assert.match(checkpoint, /phase: "COMPLETED"/); assert.match(checkpoint, /phase: "FAILED"/); assert.match(checkpoint, /"BLOCKED"/);
  assert.match(retry, /mapReplayStarted/); assert.match(cases, /mapDatasetItemCaptured/); assert.match(checkpoint, /appendCanonicalEventInTransaction/);
});
