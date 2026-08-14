import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("checkpoint lifecycle dual-writes every durable canonical phase", () => {
  const checkpoint = readFileSync("lib/services/press-ai-debugger/checkpointDebuggerService.ts", "utf8"); const retry = readFileSync("lib/services/press-ai-debugger/retryService.ts", "utf8"); const cases = readFileSync("lib/services/press-ai-debugger/caseService.ts", "utf8");
  for (const mapper of ["mapRunLifecycle", "mapNodeLifecycle", "mapTransitionEvaluation", "mapHumanApproval", "mapEdgeTraversed"]) assert.match(checkpoint, new RegExp(mapper));
  assert.match(checkpoint, /phase: "STARTED"/); assert.match(checkpoint, /phase: "COMPLETED"/); assert.match(checkpoint, /phase: "FAILED"/); assert.match(checkpoint, /"BLOCKED"/);
  assert.match(retry, /mapReplayStarted/); assert.match(cases, /mapDatasetItemCaptured/); assert.match(checkpoint, /appendCanonicalEventInTransaction/);
});

test("checkpoint fact hooks are optional and execute at transaction-scoped mutations", () => {
  const checkpoint = readFileSync("lib/services/press-ai-debugger/checkpointDebuggerService.ts", "utf8");
  for (const hook of ["onAttemptCreated", "onNodeStarted", "onNodeCompleted", "onNodeFailed", "onTransitionEvaluated", "onTransitionSelected", "onEvidenceEvaluated", "onAttemptTerminal"]) assert.match(checkpoint, new RegExp(`${hook}(?:\\?\\.|!)\\(tx`));
  assert.match(checkpoint, /onAttemptCreated\?\.\(tx/);
  assert.match(checkpoint, /onNodeCompleted\?\.\(tx/);
  assert.match(checkpoint, /onTransitionSelected\?\.\(tx/);
});

test("checkpoint completion exposes persisted output identity before transition evaluation", () => {
  const checkpoint = readFileSync("lib/services/press-ai-debugger/checkpointDebuggerService.ts", "utf8");
  assert.match(checkpoint, /onNodeCompleted[^;]+checkpointId[^;]+output/);
  assert.match(checkpoint, /onEvidenceEvaluated[^;]+transitionId[^;]+evidenceEvaluationId/);
  assert.match(checkpoint, /onTransitionSelected[^;]+evidenceEvaluationId/);
  const persisted = checkpoint.indexOf("pressAiDebugCheckpoint.create");
  const completed = checkpoint.indexOf("onNodeCompleted?.(tx", persisted);
  const evaluated = checkpoint.indexOf("onTransitionEvaluated?.(tx", persisted);
  assert.ok(persisted >= 0 && completed > persisted && evaluated > completed);
});
