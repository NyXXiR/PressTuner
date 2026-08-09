import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json } from "./checkpointRepository";
import { replayOrRunCommand } from "./commandRepository";
import { findDebugCase, listDebugCases as listDebugCasesFromRepository } from "./caseRepository";
import { mapDatasetItemCaptured } from "@/domain/ai-telemetry/pressMapper";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { DEFAULT_PRESS_AI_CASE_TOPOLOGY, PressAiCaseTopologySchema, PressAiGuardrailSnapshotSchema, parsePressAiCaseTopology, rebasePressAiArticleReferences } from "@/domain/press-ai-debugger/caseConfiguration";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { validatePressTransitionCompatibility } from "@/domain/press-ai-debugger/transitionCompatibility";
import { hashPressAiDebugCommand, PressAiDebugConflictError } from "./commandRepository";
import { createPressDebugArticle } from "./processNodeExecutors";
import { createPressProcessRun } from "./processPersistence";
import { mapReplayStarted, mapRunLifecycle } from "@/domain/ai-telemetry/pressMapper";

export const DebugCaseExpectationSchema = z.object({ id: z.string().min(1).max(100), field: z.enum(["contains", "notContains"]), value: z.string().min(1).max(1000), verdict: z.enum(["WARN", "BLOCK"]).optional() }).strict();
export const SaveDebugCaseSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative(), checkpointId: z.string().min(1), name: z.string().trim().min(1).max(120), expectations: z.array(DebugCaseExpectationSchema).max(50).default([]) }).strict();
const CaseCommandEnvelopeSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative() });
export const UpdateDebugCaseTopologySchema = CaseCommandEnvelopeSchema.extend({ topology: PressAiCaseTopologySchema }).strict();
export const CreateDebugCaseGuardrailSchema = CaseCommandEnvelopeSchema.extend({ guardrailId: z.string().min(1).max(100), edgeId: z.string().min(1).max(100), instruction: z.string().trim().min(1).max(4000), severity: z.enum(["WARN", "BLOCK"]) }).strict();
export const UpdateDebugCaseGuardrailSchema = CaseCommandEnvelopeSchema.extend({ edgeId: z.string().min(1).max(100), instruction: z.string().trim().min(1).max(4000), severity: z.enum(["WARN", "BLOCK"]) }).strict();
export const DeleteDebugCaseGuardrailSchema = CaseCommandEnvelopeSchema.strict();
export const RerunDebugCaseSchema = CaseCommandEnvelopeSchema.strict();

const mandatoryGuardrailIds = new Set(pressCreationProcess.edges.flatMap((edge) => edge.mandatoryGuardrailIds));
function assertMutableGuardrailId(id: string) { if (mandatoryGuardrailIds.has(id)) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_MANDATORY_GUARDRAIL_IMMUTABLE"); }
function assertCompatibleEnabledEdge(edgeId: string, topologyValue: unknown) {
  const topology = parsePressAiCaseTopology(topologyValue);
  const edge = pressCreationProcess.edges.find((item) => item.id === edgeId);
  if (!edge || !topology.enabledEdgeIds.includes(edgeId) || !validatePressTransitionCompatibility(edge).compatible) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_CASE_EDGE_INVALID");
  return edge;
}

async function replayOrRunCaseCommand<T>(args: { tx: Prisma.TransactionClient; teamId: string; caseId: string; commandId: string; kind: string; expectedRevision: number; request: unknown; mutate: (debugCase: { id: string; revision: number; topologyConfig: unknown }) => Promise<T> }) {
  const requestHash = hashPressAiDebugCommand(args.request);
  await args.tx.$queryRaw`SELECT id FROM press_ai_debug_case WHERE id = ${args.caseId} AND team_id = ${args.teamId} FOR UPDATE`;
  const existing = await args.tx.pressAiDebugCaseCommand.findUnique({ where: { caseId_commandId: { caseId: args.caseId, commandId: args.commandId } } });
  if (existing) { if (existing.kind !== args.kind || existing.requestHash !== requestHash || existing.expectedRevision !== args.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT"); return { replayed: true, response: existing.response as T }; }
  const debugCase = await args.tx.pressAiDebugCase.findFirst({ where: { id: args.caseId, teamId: args.teamId } });
  if (!debugCase) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_NOT_FOUND"), { status: 404 });
  if (debugCase.revision !== args.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
  const response = await args.mutate(debugCase);
  await args.tx.pressAiDebugCaseCommand.create({ data: { caseId: args.caseId, commandId: args.commandId, kind: args.kind, expectedRevision: args.expectedRevision, requestHash, response: json(response) } });
  return { replayed: false, response };
}

export async function saveManualDebugCase(args: { teamId: string; userId: string; attemptId: string; input: z.infer<typeof SaveDebugCaseSchema> }) {
  return prisma.$transaction(async (tx) => replayOrRunCommand({ tx, teamId: args.teamId, attemptId: args.attemptId, commandId: args.input.commandId, kind: "SAVE_CASE", expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (locked) => {
    const checkpoint = await tx.pressAiDebugCheckpoint.findFirst({ where: { id: args.input.checkpointId, attemptId: args.attemptId, attempt: { teamId: args.teamId } }, include: { attempt: true } });
    if (!checkpoint) throw Object.assign(new Error("PRESS_AI_DEBUG_CHECKPOINT_NOT_FOUND"), { status: 404 });
    const saved = await tx.pressAiDebugCase.upsert({ where: { sourceCheckpointId_captureKind: { sourceCheckpointId: checkpoint.id, captureKind: "MANUAL" } }, update: { name: args.input.name, status: "SAVED" }, create: { teamId: args.teamId, createdById: args.userId, name: args.input.name, status: "SAVED", processId: checkpoint.attempt.processId, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash, sourceAttemptId: args.attemptId, sourceCheckpointId: checkpoint.id, startNodeId: checkpoint.nodeId, inputSnapshot: json(checkpoint.input), topologyConfig: json(DEFAULT_PRESS_AI_CASE_TOPOLOGY), expectations: [], captureKind: "MANUAL" } });
    const edge = pressCreationProcess.edges.find((item) => item.source === checkpoint.nodeId && item.kind !== "ITERATION");
    await tx.pressAiDebugCaseGuardrail.deleteMany({ where: { caseId: saved.id } });
    if (edge && args.input.expectations.length) await tx.pressAiDebugCaseGuardrail.createMany({ data: args.input.expectations.map((item, displayOrder) => ({ caseId: saved.id, guardrailId: item.id, edgeId: edge.id, instruction: item.field === "contains" ? `전이 대상 내용은 다음 값을 포함해야 합니다: ${item.value}` : `전이 대상 내용은 다음 값을 포함하지 않아야 합니다: ${item.value}`, severity: item.verdict ?? "WARN", evaluatorId: "semantic-guardrail", evaluatorVersion: "1.0.0", displayOrder })) });
    const run = await tx.agentRun.findUnique({ where: { id: checkpoint.attempt.agentRunId }, select: { traceId: true } });
    await appendCanonicalEvent(tx, mapDatasetItemCaptured({ teamId: args.teamId, runId: checkpoint.attempt.agentRunId, traceId: run?.traceId, attemptId: args.attemptId, caseId: saved.id, processId: checkpoint.attempt.processId, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash }, { caseId: saved.id, checkpointId: checkpoint.id, captureKind: "MANUAL" }));
    await tx.pressAiDebugAttempt.update({ where: { id: args.attemptId }, data: { revision: { increment: 1 } } });
    return { caseId: saved.id, revision: locked.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getDebugCase(args: { teamId: string; caseId: string }) { const value = await findDebugCase(args.teamId, args.caseId); if (!value) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_NOT_FOUND"), { status: 404 }); return value; }
export async function listDebugCases(teamId: string) { return listDebugCasesFromRepository(teamId); }

export async function updateDebugCaseTopology(args: { teamId: string; caseId: string; input: z.infer<typeof UpdateDebugCaseTopologySchema> }) {
  return prisma.$transaction(async (tx) => replayOrRunCaseCommand({ tx, teamId: args.teamId, caseId: args.caseId, commandId: args.input.commandId, kind: "UPDATE_TOPOLOGY", expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (debugCase) => {
    const topology = PressAiCaseTopologySchema.parse(args.input.topology);
    const guardrails = await tx.pressAiDebugCaseGuardrail.findMany({ where: { caseId: args.caseId }, select: { edgeId: true } });
    if (guardrails.some((item) => !topology.enabledEdgeIds.includes(item.edgeId as never))) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_CASE_EDGE_HAS_GUARDRAILS");
    await tx.pressAiDebugCase.update({ where: { id: args.caseId }, data: { topologyConfig: json(topology), revision: { increment: 1 } } });
    return { caseId: args.caseId, revision: debugCase!.revision + 1, topology };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createDebugCaseGuardrail(args: { teamId: string; caseId: string; input: z.infer<typeof CreateDebugCaseGuardrailSchema> }) {
  assertMutableGuardrailId(args.input.guardrailId);
  return prisma.$transaction(async (tx) => replayOrRunCaseCommand({ tx, teamId: args.teamId, caseId: args.caseId, commandId: args.input.commandId, kind: "CREATE_GUARDRAIL", expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (debugCase) => {
    assertCompatibleEnabledEdge(args.input.edgeId, debugCase!.topologyConfig);
    const maxOrder = await tx.pressAiDebugCaseGuardrail.aggregate({ where: { caseId: args.caseId, edgeId: args.input.edgeId }, _max: { displayOrder: true } });
    await tx.pressAiDebugCaseGuardrail.create({ data: { caseId: args.caseId, guardrailId: args.input.guardrailId, edgeId: args.input.edgeId, instruction: args.input.instruction, severity: args.input.severity, evaluatorId: "semantic-guardrail", evaluatorVersion: "1.0.0", displayOrder: (maxOrder._max.displayOrder ?? -1) + 1 } });
    await tx.pressAiDebugCase.update({ where: { id: args.caseId }, data: { revision: { increment: 1 } } });
    return { caseId: args.caseId, guardrailId: args.input.guardrailId, revision: debugCase!.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateDebugCaseGuardrail(args: { teamId: string; caseId: string; guardrailId: string; input: z.infer<typeof UpdateDebugCaseGuardrailSchema> }) {
  assertMutableGuardrailId(args.guardrailId);
  return prisma.$transaction(async (tx) => replayOrRunCaseCommand({ tx, teamId: args.teamId, caseId: args.caseId, commandId: args.input.commandId, kind: `UPDATE_GUARDRAIL:${args.guardrailId}`, expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (debugCase) => {
    assertCompatibleEnabledEdge(args.input.edgeId, debugCase!.topologyConfig);
    const guardrail = await tx.pressAiDebugCaseGuardrail.findUnique({ where: { caseId_guardrailId: { caseId: args.caseId, guardrailId: args.guardrailId } } });
    if (!guardrail) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_GUARDRAIL_NOT_FOUND"), { status: 404 });
    await tx.pressAiDebugCaseGuardrail.update({ where: { id: guardrail.id }, data: { edgeId: args.input.edgeId, instruction: args.input.instruction, severity: args.input.severity } });
    await tx.pressAiDebugCase.update({ where: { id: args.caseId }, data: { revision: { increment: 1 } } });
    return { caseId: args.caseId, guardrailId: args.guardrailId, revision: debugCase!.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteDebugCaseGuardrail(args: { teamId: string; caseId: string; guardrailId: string; input: z.infer<typeof DeleteDebugCaseGuardrailSchema> }) {
  assertMutableGuardrailId(args.guardrailId);
  return prisma.$transaction(async (tx) => replayOrRunCaseCommand({ tx, teamId: args.teamId, caseId: args.caseId, commandId: args.input.commandId, kind: `DELETE_GUARDRAIL:${args.guardrailId}`, expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (debugCase) => {
    const deleted = await tx.pressAiDebugCaseGuardrail.deleteMany({ where: { caseId: args.caseId, guardrailId: args.guardrailId } });
    if (deleted.count !== 1) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_GUARDRAIL_NOT_FOUND"), { status: 404 });
    await tx.pressAiDebugCase.update({ where: { id: args.caseId }, data: { revision: { increment: 1 } } });
    return { caseId: args.caseId, guardrailId: args.guardrailId, revision: debugCase!.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rerunDebugCase(args: { teamId: string; userId: string; caseId: string; input: z.infer<typeof RerunDebugCaseSchema> }) {
  const existing = await prisma.pressAiDebugCaseCommand.findUnique({ where: { caseId_commandId: { caseId: args.caseId, commandId: args.input.commandId } } });
  if (existing) { if (existing.kind !== "RERUN" || existing.requestHash !== hashPressAiDebugCommand(args.input) || existing.expectedRevision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT"); return { replayed: true, response: existing.response }; }
  const debugCase = await prisma.pressAiDebugCase.findFirst({ where: { id: args.caseId, teamId: args.teamId }, include: { sourceAttempt: { include: { checkpoints: { orderBy: { sequence: "asc" } } } }, sourceCheckpoint: true, guardrails: { orderBy: { displayOrder: "asc" } } } });
  if (!debugCase) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_NOT_FOUND"), { status: 404 });
  if (debugCase.revision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
  const article = await createPressDebugArticle(args);
  const rebasedRunInput = rebasePressAiArticleReferences(debugCase.sourceAttempt.inputSnapshot, debugCase.sourceAttempt.articleId, article.id) as Record<string, unknown>;
  const captureInput = rebasePressAiArticleReferences(debugCase.inputSnapshot, debugCase.sourceAttempt.articleId, article.id);
  const run = await createPressProcessRun({ teamId: args.teamId, userId: args.userId, processId: "press-creation", input: rebasedRunInput });
  const response = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM press_ai_debug_case WHERE id = ${args.caseId} AND team_id = ${args.teamId} FOR UPDATE`;
    const current = await tx.pressAiDebugCase.findUnique({ where: { id: args.caseId } });
    if (!current || current.revision !== args.input.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
    const concurrent = await tx.pressAiDebugCaseCommand.findUnique({ where: { caseId_commandId: { caseId: args.caseId, commandId: args.input.commandId } } });
    if (concurrent) return concurrent.response as Record<string, unknown>;
    const topology = parsePressAiCaseTopology(current.topologyConfig);
    const guardrails = PressAiGuardrailSnapshotSchema.parse(debugCase.guardrails.map((item) => ({ id: item.guardrailId, edgeId: item.edgeId, instruction: item.instruction, severity: item.severity, evaluatorId: item.evaluatorId, evaluatorVersion: item.evaluatorVersion, displayOrder: item.displayOrder })));
    const restored = debugCase.sourceAttempt.checkpoints.filter((item) => item.sequence < debugCase.sourceCheckpoint.sequence);
    const attempt = await tx.pressAiDebugAttempt.create({ data: { id: args.input.commandId, teamId: args.teamId, createdById: args.userId, caseId: args.caseId, caseRevision: current.revision, topologySnapshot: json(topology), guardrailSnapshot: json(guardrails), captureInputSnapshot: json(captureInput), currentIteration: Math.max(0, ...restored.filter((item) => item.nodeId === "selected-rewrite").map((item) => item.iteration)), agentRunId: run.id, parentAttemptId: debugCase.sourceAttemptId, baselineAttemptId: debugCase.sourceAttempt.baselineAttemptId ?? debugCase.sourceAttemptId, processId: debugCase.processId, processVersion: debugCase.processVersion, registryHash: debugCase.registryHash, executorVersion: debugCase.sourceAttempt.executorVersion, startNodeId: debugCase.startNodeId, activeNodeId: debugCase.startNodeId, articleId: article.id, inputSnapshot: json(rebasedRunInput) } });
    for (const checkpoint of restored) await tx.pressAiDebugCheckpoint.create({ data: { attemptId: attempt.id, nodeId: checkpoint.nodeId, sequence: checkpoint.sequence, iteration: checkpoint.iteration, mode: "RESTORED", input: json(rebasePressAiArticleReferences(checkpoint.input, debugCase.sourceAttempt.articleId, article.id)), output: json(rebasePressAiArticleReferences(checkpoint.output, debugCase.sourceAttempt.articleId, article.id)), restoredFromCheckpointId: checkpoint.id, quotaUnits: 0, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash, executorVersion: checkpoint.executorVersion } });
    const result = { attemptId: attempt.id, articleId: article.id, revision: 0, caseRevision: current.revision };
    await tx.pressAiDebugCaseCommand.create({ data: { caseId: args.caseId, commandId: args.input.commandId, kind: "RERUN", expectedRevision: args.input.expectedRevision, requestHash: hashPressAiDebugCommand(args.input), response: json(result) } });
    const context = { teamId: args.teamId, runId: run.id, traceId: run.traceId, attemptId: attempt.id, parentAttemptId: debugCase.sourceAttemptId, caseId: args.caseId, processId: attempt.processId, processVersion: attempt.processVersion, registryHash: attempt.registryHash, executionMode: "REPLAY" as const };
    await appendCanonicalEvent(tx, mapRunLifecycle(context, "STARTED"));
    await appendCanonicalEvent(tx, mapReplayStarted(context, { sourceAttemptId: debugCase.sourceAttemptId, restoredCheckpointId: debugCase.sourceCheckpointId, caseId: args.caseId }));
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { replayed: false, response };
}
