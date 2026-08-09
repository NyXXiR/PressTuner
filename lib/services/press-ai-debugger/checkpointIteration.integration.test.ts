import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { DEFAULT_PRESS_AI_CASE_TOPOLOGY } from "@/domain/press-ai-debugger/caseConfiguration";
import { prisma } from "@/lib/prisma";
import { advanceCheckpointEdge, createCheckpointAttempt, finishCheckpointAttempt } from "./checkpointDebuggerService";

test("repeatable checkpoints retain occurrence identity and the pinned iteration cap is enforced", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `checkpoint-iteration-${suffix}`, label: "Checkpoint iteration" } });
  const team = await prisma.team.create({ data: { slug: `checkpoint-iteration-${suffix}`, name: "Checkpoint iteration", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const attemptId = randomUUID();
  try {
    await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: attemptId, expectedRevision: 0, rawText: "원문", tone: "formal" } });
    const attempt = await prisma.pressAiDebugAttempt.update({ where: { id: attemptId }, data: { status: "INSPECTING", activeNodeId: null, currentIteration: 1, topologySnapshot: { ...DEFAULT_PRESS_AI_CASE_TOPOLOGY, maxIterations: 1 } } });
    const common = { attemptId, mode: "EXECUTED" as const, input: {}, output: {}, quotaUnits: 0, processVersion: attempt.processVersion, registryHash: attempt.registryHash, executorVersion: attempt.executorVersion };
    await prisma.pressAiDebugCheckpoint.createMany({ data: [
      { ...common, nodeId: "draft-review", sequence: 0, iteration: 0 },
      { ...common, nodeId: "draft-review", sequence: 1, iteration: 1 },
    ] });
    assert.equal(await prisma.pressAiDebugCheckpoint.count({ where: { attemptId, nodeId: "draft-review" } }), 2);
    const rewrite = await prisma.pressAiDebugCheckpoint.create({ data: { ...common, nodeId: "selected-rewrite", sequence: 2, iteration: 1 } });
    await prisma.pressAiDebugTransition.create({ data: { attemptId, edgeId: "rewrite-review", sequence: 2, iteration: 1, sourceNodeId: "selected-rewrite", targetNodeId: "draft-review", sourceCheckpointId: rewrite.id, targetPayload: {}, verdict: "PASS", evaluationState: "COMPLETED", disposition: "PENDING" } });
    await assert.rejects(advanceCheckpointEdge({ teamId: team.id, userId: user.id, attemptId, edgeId: "rewrite-review", input: { commandId: randomUUID(), expectedRevision: 0, acknowledgeWarn: false, acknowledgeHumanGate: true } }), /PRESS_AI_DEBUG_ITERATION_LIMIT_REACHED/);
    await finishCheckpointAttempt({ teamId: team.id, userId: user.id, attemptId, input: { commandId: randomUUID(), expectedRevision: 0 } });
    const finished = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    assert.equal(finished.status, "COMPLETED");
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
