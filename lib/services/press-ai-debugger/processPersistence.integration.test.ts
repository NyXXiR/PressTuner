import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  createPressProcessRun,
  finalizeProcessRunObservability,
  persistProcessEvent,
  readProcessOperationId,
  setProcessWaiting,
} from "./processPersistence";

test("process runs keep one trace and operation through waiting and fail-open terminal export", async () => {
  const suffix = randomUUID();
  const operationId = "10000000-0000-4000-8000-000000000001";
  const traceId = "123e4567e89b12d3a456426614174000";
  const user = await prisma.user.create({ data: { loginId: `process-observability-${suffix}`, label: "Process observability" } });
  const team = await prisma.team.create({ data: { slug: `process-observability-${suffix}`, name: "Process observability", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  let beginCalls = 0;
  const completedOperations: Array<string> = [];
  const exportedRuns: Array<string> = [];
  const deliveryOrder: string[] = [];

  try {
    const run = await createPressProcessRun({ teamId: team.id, userId: user.id, processId: "press-creation", input: { rawText: "private prompt" }, enableObservability: true }, {
      generateTraceId: () => traceId,
      beginOperation: async (args) => {
        deliveryOrder.push(`begin:${args.workflowId}`);
        beginCalls += 1;
        assert.equal(args.traceId, traceId);
        return { status: "registered", operationId, environment: "test" };
      },
    });
    await persistProcessEvent({ teamId: team.id, runId: run.id, processId: "press-creation", event: { type: "run.started", dedupeKey: "run:started", run: { status: "running" } } });
    await setProcessWaiting({ teamId: team.id, runId: run.id, processId: "press-creation", nodeId: "brief-normalization", gateId: "confirm-normalized-brief", output: { cursor: "brief-normalization" } });

    const waiting = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id }, select: { traceId: true, input: true, status: true } });
    assert.equal(waiting.traceId, traceId);
    assert.equal(readProcessOperationId(waiting.input), operationId);
    assert.equal(waiting.status, "WAITING_APPROVAL");
    assert.equal(beginCalls, 1);
    assert.equal(completedOperations.length, 0);
    assert.equal(exportedRuns.length, 0);

    await finalizeProcessRunObservability({ teamId: team.id, runId: run.id, processId: "press-creation", status: "succeeded" }, {
      completeOperation: async ({ operationId: completedOperationId }) => {
        deliveryOrder.push(`complete:${completedOperationId}`);
        completedOperations.push(completedOperationId);
        throw new Error("ops console unavailable");
      },
      exportTelemetry: async ({ runId }) => {
        deliveryOrder.push(`otlp:${runId}`);
        exportedRuns.push(runId);
        throw new Error("otlp unavailable");
      },
    });

    assert.deepEqual(completedOperations, [operationId]);
    assert.deepEqual(exportedRuns, [run.id]);
    assert.deepEqual(deliveryOrder, [`begin:presstuner.press-creation`, `otlp:${run.id}`, `complete:${operationId}`]);
    const terminal = await prisma.agentRuntimeAuditEvent.findFirstOrThrow({ where: { teamId: team.id, runId: run.id, eventType: "CANONICAL_AI_TELEMETRY_V1", eventKind: "run.lifecycle", details: { path: ["payload", "phase"], equals: "COMPLETED" } } });
    assert.equal(terminal.traceId, traceId);
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
