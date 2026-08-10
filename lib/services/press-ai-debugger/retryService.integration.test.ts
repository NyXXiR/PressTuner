import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { createCheckpointAttempt } from "./checkpointDebuggerService";
import { json } from "./checkpointRepository";
import { retryDebugAttempt } from "./retryService";

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
    await prisma.pressAiDebugTransition.create({
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
