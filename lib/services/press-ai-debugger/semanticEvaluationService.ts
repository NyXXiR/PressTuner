import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { mapDatasetItemCaptured, mapRunLifecycle, mapTransitionEvaluation } from "@/domain/ai-telemetry/pressMapper";
import { PressAiGuardrailSnapshotSchema, parsePressAiCaseTopology } from "@/domain/press-ai-debugger/caseConfiguration";
import { rollUpGuardrailVerdict, type GuardrailObservation, type GuardrailVerdict } from "@/domain/press-ai-debugger/transitionGuardrails";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { prisma } from "@/lib/prisma";
import {
  evaluateSemanticGuardrails,
  PRESS_AI_SEMANTIC_EVALUATOR_ID,
  PRESS_AI_SEMANTIC_EVALUATOR_MODEL,
  PRESS_AI_SEMANTIC_EVALUATOR_VERSION,
  type SemanticGuardrailEvaluation,
} from "./semanticGuardrailEvaluator";
import { hashPressAiDebugCommand, PressAiDebugConflictError } from "./commandRepository";
import { json } from "./checkpointRepository";

export const PRESS_AI_EVALUATION_LEASE_MS = 30_000;
export const ReevaluatePressAiTransitionSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative() }).strict();

type Evaluator = typeof evaluateSemanticGuardrails;
type Clock = () => Date;

const verdictFor = (status: "SATISFIED" | "VIOLATED" | "NOT_EVALUABLE", severity: "WARN" | "BLOCK"): GuardrailVerdict =>
  status === "SATISFIED" ? "PASS" : status === "NOT_EVALUABLE" ? "NOT_EVALUABLE" : severity;

function latestByGuardrail<T extends { guardrailId: string; origin?: string; evaluationRevision: number }>(items: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const item of items) { const key = `${item.origin ?? ""}:${item.guardrailId}`; if (!latest.has(key) || latest.get(key)!.evaluationRevision < item.evaluationRevision) latest.set(key, item); }
  return [...latest.values()];
}

export function semanticEvaluationRequestHash(input: unknown) {
  return hashPressAiDebugCommand(input);
}

export async function resumeSemanticEvaluationCommand(args: {
  teamId: string;
  userId: string;
  attemptId: string;
  commandId: string;
  evaluator?: Evaluator;
  now?: Clock;
  leaseToken?: string;
}) {
  const command = await prisma.pressAiDebugCommand.findUnique({ where: { attemptId_commandId: { attemptId: args.attemptId, commandId: args.commandId } } });
  if (!command) throw Object.assign(new Error("PRESS_AI_DEBUG_COMMAND_NOT_FOUND"), { status: 404 });
  if (command.status === "COMPLETED") return { replayed: true, response: command.response };
  if (!command.evaluationBatchId) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_EVALUATION_BATCH_MISSING");
  const result = await evaluateLeasedSemanticBatch({ teamId: args.teamId, userId: args.userId, batchId: command.evaluationBatchId, evaluator: args.evaluator, now: args.now, leaseToken: args.leaseToken });
  if (result.state !== "COMPLETED") return { replayed: true, response: command.stagedResponse };
  const completed = await prisma.pressAiDebugCommand.findUniqueOrThrow({ where: { id: command.id } });
  return { replayed: result.replayed, response: completed.response };
}

export async function evaluateLeasedSemanticBatch(args: {
  teamId: string;
  userId: string;
  batchId: string;
  evaluator?: Evaluator;
  now?: Clock;
  leaseToken?: string;
}) {
  const now = args.now ?? (() => new Date());
  const leaseToken = args.leaseToken ?? randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM press_ai_debug_evaluation_batch WHERE id = ${args.batchId} FOR UPDATE`;
    const batch = await tx.pressAiDebugEvaluationBatch.findUnique({ where: { id: args.batchId }, include: { transition: { include: { attempt: true, sourceCheckpoint: true } } } });
    if (!batch || batch.transition.attempt.teamId !== args.teamId) throw Object.assign(new Error("PRESS_AI_DEBUG_EVALUATION_NOT_FOUND"), { status: 404 });
    if (batch.state === "COMPLETED") return { kind: "completed" as const };
    if (batch.state === "RUNNING" && batch.leaseExpiresAt && batch.leaseExpiresAt > now()) return { kind: "leased" as const };
    const leaseExpiresAt = new Date(now().getTime() + PRESS_AI_EVALUATION_LEASE_MS);
    await tx.pressAiDebugEvaluationBatch.update({ where: { id: batch.id }, data: { state: "RUNNING", leaseToken, leaseExpiresAt } });
    await tx.pressAiDebugTransition.update({ where: { id: batch.transitionId }, data: { evaluationState: "RUNNING" } });
    return { kind: "claimed" as const, batch };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if (claimed.kind === "completed") return { state: "COMPLETED" as const, replayed: true };
  if (claimed.kind === "leased") return { state: "RUNNING" as const, replayed: true };

  const { batch } = claimed;
  const allSnapshots = PressAiGuardrailSnapshotSchema.parse(batch.transition.attempt.guardrailSnapshot);
  const snapshots = allSnapshots.filter((item) => item.edgeId === batch.transition.edgeId);
  let evaluated: SemanticGuardrailEvaluation;
  try {
    evaluated = await (args.evaluator ?? evaluateSemanticGuardrails)({
      guardrails: snapshots.map((item) => ({ id: item.id, instruction: item.instruction })),
      sourceOutput: batch.transition.sourceCheckpoint.output,
      targetPayload: batch.transition.targetPayload,
    });
  } catch {
    evaluated = {
      results: snapshots.map((item) => ({ guardrailId: item.id, status: "NOT_EVALUABLE", reason: "semantic evaluator unavailable" })),
      model: PRESS_AI_SEMANTIC_EVALUATOR_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostMicros: 0,
    };
  }

  const finalized = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM press_ai_debug_evaluation_batch WHERE id = ${batch.id} FOR UPDATE`;
    const current = await tx.pressAiDebugEvaluationBatch.findUnique({ where: { id: batch.id } });
    if (!current || current.state !== "RUNNING" || current.leaseToken !== leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt <= now()) {
      return { accepted: false as const };
    }
    const byId = new Map(snapshots.map((item) => [item.id, item]));
    const results = evaluated.results.map((item) => ({ result: item, guardrail: byId.get(item.guardrailId) })).filter((item): item is { result: (typeof evaluated.results)[number]; guardrail: (typeof snapshots)[number] } => Boolean(item.guardrail));
    const strictCardinality = evaluated.results.length === snapshots.length && results.length === snapshots.length && new Set(results.map((item) => item.result.guardrailId)).size === snapshots.length;
    const safeResults = strictCardinality ? results : snapshots.map((guardrail) => ({ guardrail, result: { guardrailId: guardrail.id, status: "NOT_EVALUABLE" as const, reason: "missing, duplicate, or unknown result id" } }));
    const observations: GuardrailObservation[] = safeResults.map(({ guardrail, result }) => ({
      guardrailId: guardrail.id,
      origin: "CASE_GUARDRAIL",
      expected: guardrail.instruction,
      observed: result.status === "SATISFIED" ? "satisfied" : result.status === "VIOLATED" ? "violated" : "not evaluable",
      reason: result.reason,
      evidence: { edgeId: batch.transition.edgeId, evaluationRevision: batch.evaluationRevision },
      verdict: verdictFor(result.status, guardrail.severity),
      evaluationStatus: result.status,
      severity: guardrail.severity,
      evaluatorId: guardrail.evaluatorId,
      evaluatorVersion: guardrail.evaluatorVersion,
      displayOrder: guardrail.displayOrder + 100,
    }));
    if (observations.length) await tx.pressAiDebugGuardrailObservation.createMany({ data: observations.map((item) => ({ transitionId: batch.transitionId, guardrailId: item.guardrailId, origin: item.origin, expected: item.expected.slice(0, 4000), observed: item.observed, reason: item.reason.slice(0, 4000), evidence: json(item.evidence), verdict: item.verdict, evaluationStatus: item.evaluationStatus, severity: item.severity, evaluationRevision: batch.evaluationRevision, evaluatorId: item.evaluatorId, evaluatorVersion: item.evaluatorVersion, evaluationBatchId: batch.id, displayOrder: item.displayOrder })) });
    const stored = await tx.pressAiDebugGuardrailObservation.findMany({ where: { transitionId: batch.transitionId }, select: { guardrailId: true, origin: true, evaluationRevision: true, verdict: true } });
    const verdict = rollUpGuardrailVerdict(latestByGuardrail(stored));
    await tx.pressAiDebugEvaluationBatch.update({ where: { id: batch.id }, data: { state: "COMPLETED", leaseToken: null, leaseExpiresAt: null, parsedResult: json(evaluated.results), inputTokens: evaluated.inputTokens, outputTokens: evaluated.outputTokens, estimatedCostMicros: evaluated.estimatedCostMicros } });
    await tx.pressAiDebugTransition.update({ where: { id: batch.transitionId }, data: { verdict, evaluationState: "COMPLETED" } });
    const attempt = await tx.pressAiDebugAttempt.findUniqueOrThrow({ where: { id: batch.transition.attemptId }, include: { agentRun: { select: { traceId: true } } } });
    const status = verdict === "BLOCK" || verdict === "NOT_EVALUABLE" ? "BLOCKED" : "INSPECTING";
    await tx.pressAiDebugAttempt.update({ where: { id: attempt.id }, data: { status, terminalVerdict: null, revision: { increment: 1 } } });
    const commands = await tx.pressAiDebugCommand.findMany({ where: { evaluationBatchId: batch.id, status: "PENDING" } });
    for (const command of commands) {
      const staged = command.stagedResponse && typeof command.stagedResponse === "object" ? command.stagedResponse as Record<string, unknown> : {};
      await tx.pressAiDebugCommand.update({ where: { id: command.id }, data: { status: "COMPLETED", response: json({ ...staged, revision: attempt.revision + 1, status }) } });
    }
    await tx.agentRun.update({ where: { id: attempt.agentRunId }, data: { status: "WAITING_APPROVAL", output: json({ attemptId: attempt.id, transitionId: batch.transitionId, status }) } });
    const context = { teamId: args.teamId, runId: attempt.agentRunId, traceId: attempt.agentRun.traceId, attemptId: attempt.id, parentAttemptId: attempt.parentAttemptId, caseId: attempt.caseId, processId: attempt.processId, processVersion: attempt.processVersion, registryHash: attempt.registryHash };
    for (const item of observations) await appendCanonicalEvent(tx, mapTransitionEvaluation(context, { transitionId: batch.transitionId, edgeId: batch.transition.edgeId, sourceNodeId: batch.transition.sourceNodeId, evaluator: { id: item.evaluatorId, version: item.evaluatorVersion }, evaluationRevision: batch.evaluationRevision, verdict: item.verdict, reasonCode: item.evaluationStatus, evidence: item.evidence }));
    if (status === "BLOCKED") {
      const captured = await tx.pressAiDebugCase.upsert({ where: { sourceCheckpointId_captureKind: { sourceCheckpointId: batch.transition.sourceCheckpointId, captureKind: "AUTOMATIC_BLOCK" } }, update: {}, create: { teamId: args.teamId, createdById: args.userId, name: null, status: "DRAFT", processId: attempt.processId, processVersion: attempt.processVersion, registryHash: attempt.registryHash, sourceAttemptId: attempt.id, sourceCheckpointId: batch.transition.sourceCheckpointId, startNodeId: batch.transition.sourceNodeId, inputSnapshot: json(batch.transition.sourceCheckpoint.input), topologyConfig: json(parsePressAiCaseTopology(attempt.topologySnapshot)), expectations: [], captureKind: "AUTOMATIC_BLOCK", ...(allSnapshots.length ? { guardrails: { create: allSnapshots.map((guardrail) => ({ guardrailId: guardrail.id, edgeId: guardrail.edgeId, instruction: guardrail.instruction, severity: guardrail.severity, evaluatorId: guardrail.evaluatorId, evaluatorVersion: guardrail.evaluatorVersion, displayOrder: guardrail.displayOrder })) } } : {}) } });
      await appendCanonicalEvent(tx, mapDatasetItemCaptured(context, { caseId: captured.id, checkpointId: batch.transition.sourceCheckpointId, captureKind: "AUTOMATIC_BLOCK" }));
      await appendCanonicalEvent(tx, mapRunLifecycle(context, "BLOCKED", "TRANSITION_GUARDRAIL_BLOCK"));
    }
    return { accepted: true as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  if (!finalized.accepted) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_EVALUATION_LEASE_LOST");
  return { state: "COMPLETED" as const, replayed: false };
}

export async function reevaluatePressAiTransition(args: {
  teamId: string;
  userId: string;
  attemptId: string;
  transitionId: string;
  input: z.infer<typeof ReevaluatePressAiTransitionSchema>;
  evaluator?: Evaluator;
}) {
  const requestHash = hashPressAiDebugCommand(args.input);
  const staged = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM press_ai_debug_attempt WHERE id = ${args.attemptId} AND team_id = ${args.teamId} FOR UPDATE`;
    const existing = await tx.pressAiDebugCommand.findUnique({ where: { attemptId_commandId: { attemptId: args.attemptId, commandId: args.input.commandId } } });
    if (existing) {
      if (existing.kind !== `REEVALUATE:${args.transitionId}` || existing.requestHash !== requestHash || existing.expectedRevision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT");
      return { pending: existing.status === "PENDING", response: existing.response ?? existing.stagedResponse };
    }
    const attempt = await tx.pressAiDebugAttempt.findFirst({ where: { id: args.attemptId, teamId: args.teamId }, select: { revision: true, guardrailSnapshot: true } });
    if (!attempt) throw Object.assign(new Error("PRESS_AI_DEBUG_ATTEMPT_NOT_FOUND"), { status: 404 });
    if (attempt.revision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
    const transition = await tx.pressAiDebugTransition.findFirst({ where: { id: args.transitionId, attemptId: args.attemptId }, include: { sourceCheckpoint: true, evaluationBatches: { orderBy: { evaluationRevision: "desc" }, take: 1 }, observations: { where: { origin: "CASE_GUARDRAIL" }, orderBy: { evaluationRevision: "desc" } } } });
    if (!transition) throw Object.assign(new Error("PRESS_AI_DEBUG_TRANSITION_NOT_FOUND"), { status: 404 });
    if (transition.disposition !== "PENDING" || transition.evaluationState !== "COMPLETED") throw new PressAiDebugConflictError("PRESS_AI_DEBUG_REEVALUATION_NOT_ALLOWED");
    const latestRevision = transition.evaluationBatches[0]?.evaluationRevision ?? 0;
    const latest = transition.observations.filter((item) => item.evaluationRevision === latestRevision);
    if (!latest.some((item) => item.evaluationStatus === "NOT_EVALUABLE")) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_REEVALUATION_NOT_ALLOWED");
    const guardrails = PressAiGuardrailSnapshotSchema.parse(attempt.guardrailSnapshot).filter((item) => item.edgeId === transition.edgeId);
    if (!guardrails.length) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_REEVALUATION_NOT_ALLOWED");
    const evaluationRevision = latestRevision + 1;
    const batch = await tx.pressAiDebugEvaluationBatch.create({ data: { transitionId: transition.id, evaluationRevision, requestHash: semanticEvaluationRequestHash({ transitionId: transition.id, evaluationRevision, guardrails, sourceOutput: transition.sourceCheckpoint.output, targetPayload: transition.targetPayload }), evaluatorId: PRESS_AI_SEMANTIC_EVALUATOR_ID, evaluatorVersion: PRESS_AI_SEMANTIC_EVALUATOR_VERSION, model: PRESS_AI_SEMANTIC_EVALUATOR_MODEL } });
    const response = { attemptId: args.attemptId, transitionId: transition.id, evaluationRevision, revision: attempt.revision, status: "INSPECTING" };
    await tx.pressAiDebugTransition.update({ where: { id: transition.id }, data: { evaluationState: "PENDING", verdict: "NOT_EVALUABLE" } });
    await tx.pressAiDebugAttempt.update({ where: { id: args.attemptId }, data: { status: "INSPECTING" } });
    await tx.pressAiDebugCommand.create({ data: { attemptId: args.attemptId, commandId: args.input.commandId, kind: `REEVALUATE:${transition.id}`, expectedRevision: args.input.expectedRevision, requestHash, status: "PENDING", evaluationBatchId: batch.id, stagedResponse: json(response) } });
    return { pending: true, response };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!staged.pending) return { replayed: true, response: staged.response };
  return resumeSemanticEvaluationCommand({ teamId: args.teamId, userId: args.userId, attemptId: args.attemptId, commandId: args.input.commandId, evaluator: args.evaluator });
}
