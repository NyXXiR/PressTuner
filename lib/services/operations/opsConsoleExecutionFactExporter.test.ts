import assert from "node:assert/strict";
import test from "node:test";

import { mapEdgeTraversed, mapNodeLifecycle, withCanonicalSequence } from "@/domain/ai-telemetry/pressMapper";
import { exportRunExecutionFacts } from "./opsConsoleExecutionFactExporter";

const operationId = "10000000-0000-4000-8000-000000000001";
const context = {
  teamId: "team-private",
  runId: "run-private",
  attemptId: "attempt-private",
  processId: "rag-query",
  processVersion: "1.0.0",
  occurredAt: "2026-08-09T10:00:00.000Z",
} as const;

test("run fact export projects stored canonical events and appends strict batches", async () => {
  const events = [
    withCanonicalSequence(mapNodeLifecycle(context, {
      nodeId: "request-intake",
      commandId: "command-private",
      phase: "COMPLETED",
    }), 1),
    withCanonicalSequence(mapEdgeTraversed(context, {
      transitionId: "transition-private",
      edgeId: "request-retrieval",
      sourceNodeId: "request-intake",
      targetNodeId: "retrieval-execution",
      verdict: "PASS",
      acknowledged: false,
    }), 2),
  ];
  const appended: unknown[] = [];

  const result = await exportRunExecutionFacts({
    teamId: context.teamId,
    runId: context.runId,
    processId: "rag-query",
    operationId,
  }, {
    loadEvents: async () => events,
    appendBatch: async ({ batch }) => {
      appended.push(batch);
      return { status: "reported", operationId, environment: "test" };
    },
  });

  assert.deepEqual(result, { status: "exported", operationId, factCount: 2, batchCount: 1 });
  assert.equal(appended.length, 1);
  assert.doesNotMatch(JSON.stringify(appended), /team-private|run-private|attempt-private|command-private|transition-private/);
});

test("run fact export remains fail-open and returns a stable delivery failure code", async () => {
  const result = await exportRunExecutionFacts({
    teamId: context.teamId,
    runId: context.runId,
    processId: "rag-query",
    operationId,
  }, {
    loadEvents: async () => [mapNodeLifecycle(context, {
      nodeId: "request-intake",
      commandId: "command-private",
      phase: "COMPLETED",
    })],
    appendBatch: async () => ({
      status: "failed",
      code: "OPS_CONSOLE_HTTP_ERROR",
      operationId,
      environment: "test",
    }),
  });

  assert.deepEqual(result, {
    status: "failed",
    code: "OPS_CONSOLE_HTTP_ERROR",
    operationId,
  });
});

test("run fact export rejects more than 10k canonical events before appending", async () => {
  let appended = false;
  const event = mapNodeLifecycle(context, { nodeId: "request-intake", commandId: "command-private", phase: "COMPLETED" });
  const result = await exportRunExecutionFacts({ teamId: context.teamId, runId: context.runId, processId: "rag-query", operationId }, {
    loadEvents: async () => Array.from({ length: 10_001 }, (_, index) => ({ ...event, sequence: index + 1 })),
    appendBatch: async () => { appended = true; return { status: "reported", operationId, environment: "test" }; },
  });
  assert.deepEqual(result, { status: "failed", code: "CANONICAL_EVENT_LIMIT_EXCEEDED", operationId });
  assert.equal(appended, false);
});
