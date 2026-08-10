import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { customExpectationFingerprint, normalizeCustomExpectation } from "@/domain/press-ai-debugger/caseExpectations";
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

test("editing and deleting rules replaces future expectations without rewriting historical observations", async () => {
  const value = await fixture();
  try {
    const firstRules = [
      { id: "edited", edgeId: "initialization-brief", matcher: { version: 1 as const, subject: "target_payload_text" as const, operator: "contains" as const, operand: "old" }, verdict: "WARN" as const },
      { id: "deleted", matcher: { version: 1 as const, subject: "transition_text" as const, operator: "not_contains" as const, operand: "secret" }, verdict: "BLOCK" as const },
    ];
    const first = await saveManualDebugCase({
      teamId: value.team.id,
      userId: value.user.id,
      attemptId: value.attempt.id,
      input: SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: 0, checkpointId: value.checkpoint.id, name: "two rules", expectations: firstRules }),
    });
    const transition = await prisma.pressAiDebugTransition.create({ data: { attemptId: value.attempt.id, edgeId: "initialization-brief", sequence: 0, sourceNodeId: "article-initialization", targetNodeId: "brief-normalization", sourceCheckpointId: value.checkpoint.id, targetPayload: json({ articleId: value.attempt.articleId }), verdict: "WARN" } });
    const deletedFingerprint = customExpectationFingerprint(normalizeCustomExpectation(firstRules[1]));
    const historical = await prisma.pressAiDebugGuardrailObservation.create({ data: { transitionId: transition.id, guardrailId: "deleted", origin: "CASE_EXPECTATION", expected: "not secret", observed: "secret", reason: "detected", evidence: json({ ruleFingerprint: deletedFingerprint }), verdict: "BLOCK", displayOrder: 3 } });

    const editedRule = { ...firstRules[0], matcher: { ...firstRules[0].matcher, operand: "new" } };
    const second = await saveManualDebugCase({
      teamId: value.team.id,
      userId: value.user.id,
      attemptId: value.attempt.id,
      input: SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: first.response.revision, checkpointId: value.checkpoint.id, name: "one edited rule", expectations: [editedRule] }),
    });
    const detail = await getDebugCase({ teamId: value.team.id, caseId: first.response.caseId });
    assert.deepEqual(detail.expectations.map((item) => item.id), ["edited"]);
    assert.equal(detail.expectations[0]?.matcher.operand, "new");
    assert.equal(detail.expectations[0]?.validation.state, "UNTESTED");
    assert.notEqual(detail.expectations[0]?.fingerprint, customExpectationFingerprint(normalizeCustomExpectation(firstRules[0])));
    assert.equal(detail.observations.some((item) => item.id === historical.id && item.guardrailId === "deleted" && item.verdict === "BLOCK"), true);

    await assert.rejects(saveManualDebugCase({
      teamId: value.team.id,
      userId: value.user.id,
      attemptId: value.attempt.id,
      input: SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: first.response.revision, checkpointId: value.checkpoint.id, name: "stale replacement", expectations: [] }),
    }), /PRESS_AI_DEBUG_COMMAND_STALE/);
    assert.throws(() => SaveDebugCaseSchema.parse({ commandId: randomUUID(), expectedRevision: second.response.revision, checkpointId: value.checkpoint.id, name: "invalid", expectations: [{ id: "bad", matcher: { version: 1, subject: "transition_text", operator: "regex", operand: ".*" }, verdict: "WARN" }] }));
    const unchanged = await getDebugCase({ teamId: value.team.id, caseId: first.response.caseId });
    assert.deepEqual(unchanged.expectations.map((item) => [item.id, item.matcher.operand]), [["edited", "new"]]);
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: value.team.id } });
    await prisma.team.deleteMany({ where: { id: { in: [value.team.id, value.otherTeam.id] } } });
    await prisma.user.deleteMany({ where: { id: value.user.id } });
  }
});
