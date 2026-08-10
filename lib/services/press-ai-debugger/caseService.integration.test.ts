import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { createCheckpointAttempt } from "./checkpointDebuggerService";
import { json } from "./checkpointRepository";
import { getDebugCase, SaveDebugCaseSchema, saveManualDebugCase } from "./caseService";

async function fixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `case-${suffix}`, label: "Case integration" } });
  const team = await prisma.team.create({ data: { slug: `case-${suffix}`, name: "Case integration", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const otherTeam = await prisma.team.create({ data: { slug: `case-other-${suffix}`, name: "Other", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const attemptId = randomUUID();
  await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: attemptId, expectedRevision: 0, rawText: "원본", tone: "formal", reviewInstruction: "검토", rewriteInstruction: "수정" } });
  const attempt = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const checkpoint = await prisma.pressAiDebugCheckpoint.create({ data: { attemptId, nodeId: "article-initialization", sequence: 0, mode: "EXECUTED", input: json({ articleId: attempt.articleId }), output: json({ articleId: attempt.articleId }), processVersion: attempt.processVersion, registryHash: attempt.registryHash, executorVersion: attempt.executorVersion } });
  return { user, team, otherTeam, attempt, checkpoint };
}

test("saving normalizes and atomically attaches a case while stale commands leave no partial case", async () => {
  const value = await fixture();
  try {
    const stale = SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: 99, checkpointId: value.checkpoint.id, name: "stale", expectations: [{ id: "legacy", field: "contains", value: "원본" }] });
    await assert.rejects(saveManualDebugCase({ teamId: value.team.id, userId: value.user.id, attemptId: value.attempt.id, input: stale }), /PRESS_AI_DEBUG_COMMAND_STALE/);
    assert.equal(await prisma.pressAiDebugCase.count({ where: { sourceCheckpointId: value.checkpoint.id, captureKind: "MANUAL" } }), 0);
    assert.equal((await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: value.attempt.id } })).caseId, null);

    const input = SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: 0, checkpointId: value.checkpoint.id, name: "legacy saved", expectations: [{ id: "legacy", field: "notContains", value: "금지" }] });
    const saved = await saveManualDebugCase({ teamId: value.team.id, userId: value.user.id, attemptId: value.attempt.id, input });
    const attached = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: value.attempt.id } });
    assert.equal(attached.caseId, saved.response.caseId); assert.equal(attached.revision, 1);
    const stored = await prisma.pressAiDebugCase.findUniqueOrThrow({ where: { id: saved.response.caseId } });
    assert.deepEqual(stored.expectations, [{ id: "legacy", matcher: { version: 1, subject: "transition_text", operator: "not_contains", operand: "금지" }, verdict: "WARN" }]);

    const detail = await getDebugCase({ teamId: value.team.id, caseId: stored.id });
    assert.equal(detail.expectations[0]?.validation.state, "UNTESTED");
    await assert.rejects(getDebugCase({ teamId: value.otherTeam.id, caseId: stored.id }), /PRESS_AI_DEBUG_CASE_NOT_FOUND/);
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: value.team.id } });
    await prisma.team.deleteMany({ where: { id: { in: [value.team.id, value.otherTeam.id] } } });
    await prisma.user.deleteMany({ where: { id: value.user.id } });
  }
});
