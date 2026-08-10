import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { customExpectationFingerprint, normalizeCustomExpectation } from "@/domain/press-ai-debugger/caseExpectations";
import { createCheckpointAttempt, executeCheckpointNode } from "./checkpointDebuggerService";
import { json } from "./checkpointRepository";
import { retryDebugAttempt } from "./retryService";
import { getDebugCase, SaveDebugCaseSchema, saveManualDebugCase } from "./caseService";

async function createFixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `retry-${suffix}`, label: "Retry integration" },
  });
  const team = await prisma.team.create({
    data: {
      slug: `retry-${suffix}`,
      name: "Retry integration",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  return { user, team };
}

async function createParent(teamId: string, userId: string) {
  const commandId = randomUUID();
  await createCheckpointAttempt({
    teamId,
    userId,
    input: {
      commandId,
      expectedRevision: 0,
      rawText: "원본 메모",
      tone: "formal",
      reviewInstruction: "검토",
      rewriteInstruction: "수정",
    },
  });
  return prisma.pressAiDebugAttempt.findUniqueOrThrow({
    where: { id: commandId },
  });
}

async function cleanup(teamId: string, userId: string) {
  await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId } });
  const attemptIds = (await prisma.pressAiDebugAttempt.findMany({
    where: { teamId },
    select: { id: true },
  })).map((item) => item.id);
  await prisma.pressAiDebugComparison.deleteMany({
    where: {
      OR: [
        { baselineAttemptId: { in: attemptIds } },
        { candidateAttemptId: { in: attemptIds } },
      ],
    },
  });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test("retry creates an immutable child and restores only earlier checkpoints", async () => {
  const { team, user } = await createFixture();
  try {
    const parent = await createParent(team.id, user.id);
    const checkpointData = [
      { nodeId: "article-initialization", sequence: 0 },
      { nodeId: "brief-normalization", sequence: 1 },
      { nodeId: "draft-generation", sequence: 2 },
    ];
    const checkpoints = [];
    for (const item of checkpointData) {
      checkpoints.push(
        await prisma.pressAiDebugCheckpoint.create({
          data: {
            attemptId: parent.id,
            ...item,
            mode: "EXECUTED",
            input: json({ articleId: parent.articleId, node: item.nodeId }),
            output: json({ articleId: parent.articleId, result: item.nodeId }),
            quotaUnits: item.sequence,
            processVersion: parent.processVersion,
            registryHash: parent.registryHash,
            executorVersion: parent.executorVersion,
          },
        }),
      );
    }
    const attachedCase = await prisma.pressAiDebugCase.create({ data: { teamId: team.id, createdById: user.id, name: "shared matcher", status: "SAVED", processId: parent.processId, processVersion: parent.processVersion, registryHash: parent.registryHash, sourceAttemptId: parent.id, sourceCheckpointId: checkpoints[0]!.id, startNodeId: checkpoints[0]!.nodeId, inputSnapshot: json(checkpoints[0]!.input), expectations: json([{ id: "rule", matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "원본" }, verdict: "WARN" }]), captureKind: "MANUAL" } });
    await prisma.pressAiDebugAttempt.update({ where: { id: parent.id }, data: { caseId: attachedCase.id } });
    const transition = await prisma.pressAiDebugTransition.create({
      data: {
        attemptId: parent.id,
        edgeId: "initialization-brief",
        sequence: 0,
        sourceNodeId: "article-initialization",
        targetNodeId: "brief-normalization",
        sourceCheckpointId: checkpoints[0]!.id,
        targetPayload: json({ articleId: parent.articleId }),
        verdict: "PASS",
      },
    });
    const originalRule = normalizeCustomExpectation({ id: "rule", matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "원본" }, verdict: "WARN" });
    await prisma.pressAiDebugGuardrailObservation.create({ data: { transitionId: transition.id, guardrailId: "rule", origin: "CASE_EXPECTATION", expected: "original", observed: "missing", reason: "detected", evidence: json({ ruleFingerprint: customExpectationFingerprint(originalRule) }), verdict: "WARN", displayOrder: 10 } });
    const parentBefore = await prisma.pressAiDebugAttempt.findUniqueOrThrow({
      where: { id: parent.id },
      include: { checkpoints: { orderBy: { sequence: "asc" } }, transitions: true },
    });

    await assert.rejects(
      retryDebugAttempt({
        teamId: team.id,
        userId: user.id,
        attemptId: parent.id,
        input: {
          commandId: randomUUID(),
          expectedRevision: parent.revision,
          retryNodeId: "selected-rewrite",
        },
      }),
      /PRESS_AI_DEBUG_RETRY_NODE_INVALID/,
    );
    await assert.rejects(
      retryDebugAttempt({
        teamId: team.id,
        userId: user.id,
        attemptId: parent.id,
        input: {
          commandId: randomUUID(),
          expectedRevision: parent.revision,
          retryNodeId: "unknown-node",
        },
      }),
      /PRESS_AI_DEBUG_RETRY_NODE_INVALID/,
    );

    const result = await retryDebugAttempt({
      teamId: team.id,
      userId: user.id,
      attemptId: parent.id,
      input: {
        commandId: randomUUID(),
        expectedRevision: parent.revision,
        retryNodeId: "draft-generation",
      },
    });
    const child = await prisma.pressAiDebugAttempt.findUniqueOrThrow({
      where: { id: result.attemptId },
      include: { checkpoints: { orderBy: { sequence: "asc" } } },
    });
    assert.notEqual(child.id, parent.id);
    assert.notEqual(child.articleId, parent.articleId);
    assert.equal(child.parentAttemptId, parent.id);
    assert.equal(child.caseId, attachedCase.id);
    assert.equal(child.baselineAttemptId, parent.id);
    assert.equal(child.startNodeId, "draft-generation");
    assert.equal(child.activeNodeId, "draft-generation");
    assert.deepEqual(
      child.checkpoints.map((item) => ({ nodeId: item.nodeId, mode: item.mode })),
      [
        { nodeId: "article-initialization", mode: "RESTORED" },
        { nodeId: "brief-normalization", mode: "RESTORED" },
      ],
    );
    await prisma.pressAiDebugCase.update({ where: { id: attachedCase.id }, data: { expectations: json([{ id: "rule", matcher: { version: 1, subject: "transition_text", operator: "contains", operand: "편집됨" }, verdict: "WARN" }]) } });
    const childWithEditedCase = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: child.id }, include: { case: true } });
    assert.equal(((childWithEditedCase.case?.expectations as Array<{ matcher: { operand: string } }>)[0]?.matcher.operand), "편집됨");
    assert.equal((await getDebugCase({ teamId: team.id, caseId: attachedCase.id })).expectations[0]?.validation.state, "UNTESTED");
    for (const item of child.checkpoints) {
      assert.equal((item.input as { articleId: string }).articleId, child.articleId);
      assert.equal((item.output as { articleId: string }).articleId, child.articleId);
      assert.ok(item.restoredFromCheckpointId);
    }

    const parentAfter = await prisma.pressAiDebugAttempt.findUniqueOrThrow({
      where: { id: parent.id },
      include: { checkpoints: { orderBy: { sequence: "asc" } }, transitions: true },
    });
    assert.deepEqual(parentAfter.checkpoints, parentBefore.checkpoints);
    assert.deepEqual(parentAfter.transitions, parentBefore.transitions);
  } finally {
    await cleanup(team.id, user.id);
  }
});

test("a zero-checkpoint attempt can restart only from the registry first node", async () => {
  const { team, user } = await createFixture();
  try {
    const parent = await createParent(team.id, user.id);
    await assert.rejects(
      retryDebugAttempt({
        teamId: team.id,
        userId: user.id,
        attemptId: parent.id,
        input: {
          commandId: randomUUID(),
          expectedRevision: 0,
          retryNodeId: "brief-normalization",
        },
      }),
      /PRESS_AI_DEBUG_RETRY_NODE_INVALID/,
    );
    const result = await retryDebugAttempt({
      teamId: team.id,
      userId: user.id,
      attemptId: parent.id,
      input: {
        commandId: randomUUID(),
        expectedRevision: 0,
        retryNodeId: "article-initialization",
      },
    });
    const child = await prisma.pressAiDebugAttempt.findUniqueOrThrow({
      where: { id: result.attemptId },
      include: { checkpoints: true },
    });
    assert.equal(child.parentAttemptId, parent.id);
    assert.equal(child.startNodeId, "article-initialization");
    assert.equal(child.activeNodeId, "article-initialization");
    assert.deepEqual(child.checkpoints, []);
  } finally {
    await cleanup(team.id, user.id);
  }
});

test("save then branch evaluates current rules while deleted rules remain only in older observations", async () => {
  const { team, user } = await createFixture();
  try {
    const parent = await createParent(team.id, user.id);
    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId: parent.id, nodeId: "article-initialization", input: { commandId: randomUUID(), expectedRevision: 0 } });
    const parentExecuted = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: parent.id }, include: { checkpoints: true, transitions: true } });
    const sourceCheckpoint = parentExecuted.checkpoints.find((item) => item.nodeId === "article-initialization")!;
    const currentRule = { id: "current-rule", edgeId: "initialization-brief", matcher: { version: 1 as const, subject: "target_payload_text" as const, operator: "contains" as const, operand: "never-present-918273" }, verdict: "BLOCK" as const };
    const saved = await saveManualDebugCase({ teamId: team.id, userId: user.id, attemptId: parent.id, input: SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: parentExecuted.revision, checkpointId: sourceCheckpoint.id, name: "current rules", expectations: [currentRule] }) });

    const branched = await retryDebugAttempt({ teamId: team.id, userId: user.id, attemptId: parent.id, input: { commandId: randomUUID(), expectedRevision: saved.response.revision, retryNodeId: "article-initialization" } });
    const childBeforeExecution = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: branched.attemptId }, include: { checkpoints: true } });
    assert.equal(childBeforeExecution.parentAttemptId, parent.id);
    assert.equal(childBeforeExecution.caseId, saved.response.caseId);
    assert.deepEqual(childBeforeExecution.checkpoints, []);

    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId: childBeforeExecution.id, nodeId: "article-initialization", input: { commandId: randomUUID(), expectedRevision: 0 } });
    const child = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: childBeforeExecution.id }, include: { checkpoints: true, transitions: { include: { observations: { orderBy: { displayOrder: "asc" } } } } } });
    const childTransition = child.transitions.find((item) => item.edgeId === "initialization-brief")!;
    assert.equal(childTransition.verdict, "BLOCK");
    assert.deepEqual(childTransition.observations.slice(0, 2).map((item) => item.origin), ["MANDATORY", "MANDATORY"]);
    assert.equal(childTransition.observations.some((item) => item.origin === "CASE_EXPECTATION" && item.guardrailId === "current-rule" && item.verdict === "BLOCK"), true);

    const childCheckpoint = child.checkpoints.find((item) => item.nodeId === "article-initialization")!;
    const deleted = await saveManualDebugCase({ teamId: team.id, userId: user.id, attemptId: child.id, input: SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: child.revision, checkpointId: childCheckpoint.id, name: "rule deleted", expectations: [] }) });
    const branchedAgain = await retryDebugAttempt({ teamId: team.id, userId: user.id, attemptId: child.id, input: { commandId: randomUUID(), expectedRevision: deleted.response.revision, retryNodeId: "article-initialization" } });
    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId: branchedAgain.attemptId, nodeId: "article-initialization", input: { commandId: randomUUID(), expectedRevision: 0 } });
    const grandchild = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: branchedAgain.attemptId }, include: { transitions: { include: { observations: true } } } });
    assert.equal(grandchild.transitions[0]?.observations.some((item) => item.guardrailId === "current-rule"), false);
    assert.equal(await prisma.pressAiDebugGuardrailObservation.count({ where: { transitionId: childTransition.id, guardrailId: "current-rule", origin: "CASE_EXPECTATION" } }), 1);

    const parentAfter = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: parent.id }, include: { checkpoints: true, transitions: true } });
    assert.deepEqual(parentAfter.checkpoints, parentExecuted.checkpoints);
    assert.deepEqual(parentAfter.transitions, parentExecuted.transitions);
  } finally {
    await cleanup(team.id, user.id);
  }
});
