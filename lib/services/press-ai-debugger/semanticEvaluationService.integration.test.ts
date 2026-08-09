import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { createCheckpointAttempt, executeCheckpointNode } from "./checkpointDebuggerService";
import { createDebugCaseGuardrail, deleteDebugCaseGuardrail, rerunDebugCase, saveManualDebugCase, updateDebugCaseGuardrail, updateDebugCaseTopology } from "./caseService";
import { evaluateLeasedSemanticBatch, reevaluatePressAiTransition } from "./semanticEvaluationService";
import { PRESS_AI_SEMANTIC_EVALUATOR_MODEL } from "./semanticGuardrailEvaluator";

const satisfied = async (args: { guardrails: readonly { id: string }[] }) => ({
  results: args.guardrails.map((item) => ({ guardrailId: item.id, status: "SATISFIED" as const, reason: "deterministic test result" })),
  model: PRESS_AI_SEMANTIC_EVALUATOR_MODEL,
  inputTokens: 3,
  outputTokens: 2,
  estimatedCostMicros: 5,
});

test("semantic batches complete once, fail closed, and reevaluate into an immutable revision", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `semantic-evaluation-${suffix}`, label: "Semantic evaluation" } });
  const team = await prisma.team.create({ data: { slug: `semantic-evaluation-${suffix}`, name: "Semantic evaluation", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  try {
    const sourceId = randomUUID();
    await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: sourceId, expectedRevision: 0, rawText: "원문", tone: "formal" } });
    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId: sourceId, nodeId: "article-initialization", input: { commandId: randomUUID(), expectedRevision: 0 } });
    const source = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: sourceId }, include: { checkpoints: true } });
    const saved = await saveManualDebugCase({ teamId: team.id, userId: user.id, attemptId: sourceId, input: { commandId: randomUUID(), expectedRevision: 1, checkpointId: source.checkpoints[0].id, name: "semantic case", expectations: [{ id: "semantic-check", field: "contains", value: "article", verdict: "BLOCK" }] } });

    const attemptId = randomUUID();
    await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: attemptId, expectedRevision: 0, rawText: "원문", tone: "formal", caseId: saved.response.caseId } });
    let calls = 0;
    const input = { commandId: randomUUID(), expectedRevision: 0 };
    await Promise.all([
      executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId, nodeId: "article-initialization", input, semanticEvaluator: async (args) => { calls += 1; return satisfied(args); } }),
      executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId, nodeId: "article-initialization", input, semanticEvaluator: async (args) => { calls += 1; return satisfied(args); } }),
    ]);
    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId, nodeId: "article-initialization", input, semanticEvaluator: async (args) => { calls += 1; return satisfied(args); } });
    assert.equal(calls, 1);
    const completed = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { transitions: { include: { observations: true, evaluationBatches: true } }, commands: true } });
    assert.equal(completed.revision, 1);
    assert.equal(completed.transitions[0].evaluationBatches[0].state, "COMPLETED");
    assert.equal(completed.transitions[0].observations.find((item) => item.guardrailId === "semantic-check")?.evaluationStatus, "SATISFIED");
    assert.equal(completed.commands.find((item) => item.commandId === input.commandId)?.status, "COMPLETED");

    const failedId = randomUUID();
    await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: failedId, expectedRevision: 0, rawText: "원문", tone: "formal", caseId: saved.response.caseId } });
    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId: failedId, nodeId: "article-initialization", input: { commandId: randomUUID(), expectedRevision: 0 }, semanticEvaluator: async (args) => { const result = await satisfied(args); return { ...result, results: [...result.results, { guardrailId: "unknown-extra", status: "SATISFIED" as const, reason: "must fail closed" }] }; } });
    const failed = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: failedId }, include: { transitions: { include: { observations: true } } } });
    assert.equal(failed.status, "BLOCKED");
    assert.equal(failed.transitions[0].verdict, "NOT_EVALUABLE");
    const capturedFailure = await prisma.pressAiDebugCase.findFirstOrThrow({ where: { sourceAttemptId: failedId, captureKind: "AUTOMATIC_BLOCK" }, include: { guardrails: true } });
    assert.deepEqual(capturedFailure.guardrails.map((item) => item.guardrailId), ["semantic-check"]);
    const transitionId = failed.transitions[0].id;
    await reevaluatePressAiTransition({ teamId: team.id, userId: user.id, attemptId: failedId, transitionId, input: { commandId: randomUUID(), expectedRevision: 1 }, evaluator: satisfied });
    const reevaluated = await prisma.pressAiDebugTransition.findUniqueOrThrow({ where: { id: transitionId }, include: { observations: { where: { guardrailId: "semantic-check" }, orderBy: { evaluationRevision: "asc" } }, evaluationBatches: { orderBy: { evaluationRevision: "asc" } } } });
    assert.deepEqual(reevaluated.evaluationBatches.map((item) => item.evaluationRevision), [1, 2]);
    assert.deepEqual(reevaluated.observations.map((item) => [item.evaluationRevision, item.evaluationStatus]), [[1, "NOT_EVALUABLE"], [2, "SATISFIED"]]);
    assert.equal(reevaluated.verdict, "PASS");

    const takeoverBatch = await prisma.pressAiDebugEvaluationBatch.create({ data: { transitionId, evaluationRevision: 3, requestHash: "lease-takeover", evaluatorId: "semantic-guardrail", evaluatorVersion: "1.0.0", model: PRESS_AI_SEMANTIC_EVALUATOR_MODEL } });
    await prisma.pressAiDebugTransition.update({ where: { id: transitionId }, data: { evaluationState: "PENDING", verdict: "NOT_EVALUABLE" } });
    let currentTime = new Date("2026-08-09T00:00:00.000Z");
    let release!: () => void;
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const late = evaluateLeasedSemanticBatch({ teamId: team.id, userId: user.id, batchId: takeoverBatch.id, leaseToken: "expired-worker", now: () => currentTime, evaluator: async (evaluationArgs) => { started(); await wait; return satisfied(evaluationArgs); } });
    await didStart;
    currentTime = new Date(currentTime.getTime() + 31_000);
    await evaluateLeasedSemanticBatch({ teamId: team.id, userId: user.id, batchId: takeoverBatch.id, leaseToken: "takeover-worker", now: () => currentTime, evaluator: satisfied });
    release();
    await assert.rejects(late, /PRESS_AI_DEBUG_EVALUATION_LEASE_LOST/);
    const takenOver = await prisma.pressAiDebugEvaluationBatch.findUniqueOrThrow({ where: { id: takeoverBatch.id } });
    assert.equal(takenOver.state, "COMPLETED");
    assert.equal(takenOver.leaseToken, null);
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("case commands are revision-safe and rerun pins current snapshots while rebasing capture input", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `case-mutation-${suffix}`, label: "Case mutation" } });
  const team = await prisma.team.create({ data: { slug: `case-mutation-${suffix}`, name: "Case mutation", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  try {
    const sourceId = randomUUID();
    await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: sourceId, expectedRevision: 0, rawText: "원문", tone: "formal" } });
    await executeCheckpointNode({ teamId: team.id, userId: user.id, attemptId: sourceId, nodeId: "article-initialization", input: { commandId: randomUUID(), expectedRevision: 0 } });
    const source = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: sourceId }, include: { checkpoints: true } });
    const saved = await saveManualDebugCase({ teamId: team.id, userId: user.id, attemptId: sourceId, input: { commandId: randomUUID(), expectedRevision: 1, checkpointId: source.checkpoints[0].id, name: "editable case", expectations: [] } });
    const caseId = saved.response.caseId;
    const pinnedAttemptId = randomUUID();
    await createCheckpointAttempt({ teamId: team.id, userId: user.id, input: { commandId: pinnedAttemptId, expectedRevision: 0, rawText: "원문", tone: "formal", caseId } });
    const topologyCommand = { commandId: randomUUID(), expectedRevision: 0, topology: { schemaVersion: "press-ai-case-topology/v1" as const, enabledEdgeIds: ["initialization-brief", "brief-draft", "draft-review", "review-rewrite", "rewrite-review"] as ("initialization-brief" | "brief-draft" | "draft-review" | "review-rewrite" | "rewrite-review")[], maxIterations: 2 } };
    const topologyResult = await updateDebugCaseTopology({ teamId: team.id, caseId, input: topologyCommand });
    assert.equal(topologyResult.response.revision, 1);
    assert.equal((await updateDebugCaseTopology({ teamId: team.id, caseId, input: topologyCommand })).replayed, true);
    await assert.rejects(updateDebugCaseTopology({ teamId: team.id, caseId, input: { ...topologyCommand, topology: { ...topologyCommand.topology, maxIterations: 3 } } }), /PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT/);
    await createDebugCaseGuardrail({ teamId: team.id, caseId, input: { commandId: randomUUID(), expectedRevision: 1, guardrailId: "editable-semantic", edgeId: "initialization-brief", instruction: "Article ID를 보존한다", severity: "WARN" } });
    await updateDebugCaseGuardrail({ teamId: team.id, caseId, guardrailId: "editable-semantic", input: { commandId: randomUUID(), expectedRevision: 2, edgeId: "initialization-brief", instruction: "Article 참조를 보존한다", severity: "BLOCK" } });
    await deleteDebugCaseGuardrail({ teamId: team.id, caseId, guardrailId: "editable-semantic", input: { commandId: randomUUID(), expectedRevision: 3 } });
    await assert.rejects(createDebugCaseGuardrail({ teamId: team.id, caseId, input: { commandId: randomUUID(), expectedRevision: 4, guardrailId: "article-team-ownership", edgeId: "initialization-brief", instruction: "immutable", severity: "BLOCK" } }), /PRESS_AI_DEBUG_MANDATORY_GUARDRAIL_IMMUTABLE/);
    const pinned = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: pinnedAttemptId } });
    assert.equal(pinned.caseRevision, 0);
    assert.equal((pinned.topologySnapshot as { maxIterations: number }).maxIterations, 3);
    assert.deepEqual(pinned.guardrailSnapshot, []);
    const rerun = await rerunDebugCase({ teamId: team.id, userId: user.id, caseId, input: { commandId: randomUUID(), expectedRevision: 4 } });
    const attempt = await prisma.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: (rerun.response as { attemptId: string }).attemptId }, include: { checkpoints: true } });
    assert.equal(attempt.caseRevision, 4);
    assert.equal((attempt.topologySnapshot as { maxIterations: number }).maxIterations, 2);
    assert.equal(attempt.startNodeId, "article-initialization");
    assert.equal(attempt.checkpoints.length, 0);
    assert.equal((attempt.captureInputSnapshot as { articleId: string }).articleId, attempt.articleId);
    assert.notEqual(attempt.articleId, source.articleId);
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
