import { z } from "zod";
import { Prisma } from "@prisma/client";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { getProcessRegistryHash } from "@/domain/press-ai-debugger/processRegistryHash";
import { derivePressTransitionPayload } from "@/domain/press-ai-debugger/transitionPayload";
import { evaluatePressTransitionGuardrails } from "@/domain/press-ai-debugger/transitionGuardrails";
import { compareAttemptOutputs } from "@/domain/press-ai-debugger/attemptComparison";
import { prisma } from "@/lib/prisma";
import type { PressAiDependencyOverrides } from "@/lib/services/article/pressAiDependencies";
import { createPressProcessRun } from "./processPersistence";
import { createPressDebugArticle, executePressDebugNode, PRESS_AI_DEBUG_EXECUTOR_VERSION } from "./processNodeExecutors";
import { findCheckpointAttempt, json, listCheckpointAttempts, publicCheckpointAttempt } from "./checkpointRepository";
import { hashPressAiDebugCommand, PressAiDebugConflictError, replayOrRunCommand } from "./commandRepository";

export const CommandEnvelopeSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative() });
export const CreateCheckpointAttemptSchema = CommandEnvelopeSchema.extend({ rawText: z.string().min(1).max(12_000), tone: z.enum(["formal", "neutral", "friendly"]), reviewInstruction: z.string().max(1000).optional(), rewriteInstruction: z.string().max(1000).optional(), caseId: z.string().optional() }).strict();
export const ExecuteCheckpointNodeSchema = CommandEnvelopeSchema.extend({ selectedNoteIds: z.array(z.string()).max(100).optional(), rewriteInstruction: z.string().max(1000).optional() }).strict();
export const AdvanceCheckpointEdgeSchema = CommandEnvelopeSchema.extend({ acknowledgeWarn: z.boolean().default(false), acknowledgeHumanGate: z.boolean().default(false) }).strict();
const identity = { processVersion: pressCreationProcess.version, registryHash: getProcessRegistryHash(pressCreationProcess), executorVersion: PRESS_AI_DEBUG_EXECUTOR_VERSION };

export async function createCheckpointAttempt(args: { teamId: string; userId: string; input: z.infer<typeof CreateCheckpointAttemptSchema> }) {
  const existing = await findCheckpointAttempt(args.teamId, args.input.commandId);
  if (existing) { const receipt = await prisma.pressAiDebugCommand.findUnique({ where: { attemptId_commandId: { attemptId: existing.id, commandId: args.input.commandId } } }); if (!receipt || receipt.requestHash !== hashPressAiDebugCommand(args.input) || receipt.expectedRevision !== 0) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT"); return { created: false, attempt: publicCheckpointAttempt(existing) }; }
  if (args.input.expectedRevision !== 0) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
  const article = await createPressDebugArticle(args);
  const inputSnapshot = { articleId: article.id, rawText: args.input.rawText, tone: args.input.tone, reviewInstruction: args.input.reviewInstruction ?? "", rewriteInstruction: args.input.rewriteInstruction ?? "" };
  const run = await createPressProcessRun({ teamId: args.teamId, userId: args.userId, processId: "press-creation", input: inputSnapshot });
  await prisma.$transaction(async (tx) => {
    await tx.pressAiDebugAttempt.create({ data: { id: args.input.commandId, teamId: args.teamId, createdById: args.userId, caseId: args.input.caseId, agentRunId: run.id, articleId: article.id, processId: "press-creation", ...identity, startNodeId: pressCreationProcess.nodes[0].id, activeNodeId: pressCreationProcess.nodes[0].id, inputSnapshot: json(inputSnapshot) } });
    await tx.pressAiDebugCommand.create({ data: { attemptId: args.input.commandId, commandId: args.input.commandId, kind: "CREATE", expectedRevision: 0, requestHash: hashPressAiDebugCommand(args.input), response: json({ attemptId: args.input.commandId, articleId: article.id }) } });
    await tx.agentRuntimeAuditEvent.create({ data: { teamId: args.teamId, runId: run.id, eventType: "PRESS_AI_CHECKPOINT_COMMAND_V1", details: json({ attemptId: args.input.commandId, commandId: args.input.commandId, kind: "CREATE", revision: 0, ...identity }) } });
  });
  const attempt = await findCheckpointAttempt(args.teamId, args.input.commandId);
  return { created: true, attempt: publicCheckpointAttempt(attempt) };
}

export async function getCheckpointAttempt(teamId: string, attemptId: string) { const attempt = await findCheckpointAttempt(teamId, attemptId); if (!attempt) throw Object.assign(new Error("PRESS_AI_DEBUG_ATTEMPT_NOT_FOUND"), { status: 404 }); return publicCheckpointAttempt(attempt); }
export async function getCheckpointAttemptHistory(teamId: string) { return publicCheckpointAttempt(await listCheckpointAttempts(teamId)); }

export async function executeCheckpointNode(args: { teamId: string; userId: string; attemptId: string; nodeId: string; input: z.infer<typeof ExecuteCheckpointNodeSchema>; dependencies?: PressAiDependencyOverrides }) {
  return prisma.$transaction(async (tx) => replayOrRunCommand({ tx, teamId: args.teamId, attemptId: args.attemptId, commandId: args.input.commandId, kind: `EXECUTE:${args.nodeId}`, expectedRevision: args.input.expectedRevision, request: args.input, mutate: async () => {
    const attempt = await tx.pressAiDebugAttempt.findFirst({ where: { id: args.attemptId, teamId: args.teamId }, include: { transitions: { where: { advancedAt: { not: null } }, orderBy: { sequence: "desc" }, take: 1 }, checkpoints: { orderBy: { sequence: "desc" }, take: 1 }, case: true } });
    if (!attempt) throw Object.assign(new Error("PRESS_AI_DEBUG_ATTEMPT_NOT_FOUND"), { status: 404 });
    if (attempt.activeNodeId !== args.nodeId || attempt.status !== "ACTIVE") throw new PressAiDebugConflictError("PRESS_AI_DEBUG_NODE_NOT_ACTIVE");
    const node = pressCreationProcess.nodes.find((item) => item.id === args.nodeId); if (!node) throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
    const initial = attempt.inputSnapshot as Record<string, any>; const prior = attempt.transitions[0]; const restored = attempt.checkpoints[0]; const restoredEdge = restored ? pressCreationProcess.edges.find((edge) => edge.source === restored.nodeId && edge.target === node.id) : undefined;
    const nodeInput = node.sequence === 0 ? { articleId: attempt.articleId } : prior?.targetPayload as Record<string, any> ?? (restored && restoredEdge ? derivePressTransitionPayload({ edgeId: restoredEdge.id, sourceOutput: restored.output, attemptInput: initial as never }) : undefined);
    const output = node.outputSchema.parse(await executePressDebugNode({ teamId: args.teamId, userId: args.userId, nodeId: args.nodeId, input: node.inputSchema.parse(nodeInput) as Record<string, any>, dependencies: args.dependencies })) as Record<string, unknown>;
    const checkpoint = await tx.pressAiDebugCheckpoint.create({ data: { attemptId: attempt.id, nodeId: node.id, sequence: node.sequence, mode: "EXECUTED", input: json(nodeInput), output: json(output), quotaUnits: node.quotaUnits ?? 0, ...identity } });
    if (attempt.baselineAttemptId) { const baseline = await tx.pressAiDebugCheckpoint.findFirst({ where: { attemptId: attempt.baselineAttemptId, nodeId: node.id }, include: { attempt: true } }); if (baseline) await tx.pressAiDebugComparison.upsert({ where: { baselineAttemptId_candidateAttemptId_baselineCheckpointId_candidateCheckpointId: { baselineAttemptId: baseline.attemptId, candidateAttemptId: attempt.id, baselineCheckpointId: baseline.id, candidateCheckpointId: checkpoint.id } }, update: {}, create: { baselineAttemptId: baseline.attemptId, candidateAttemptId: attempt.id, baselineCheckpointId: baseline.id, candidateCheckpointId: checkpoint.id, outputComparison: json(compareAttemptOutputs({ baselineOutput: baseline.output, candidateOutput: output, baselineVerdict: null, candidateVerdict: null })), baselineProcessVersion: baseline.processVersion, candidateProcessVersion: attempt.processVersion, baselineRegistryHash: baseline.registryHash, candidateRegistryHash: attempt.registryHash, baselineExecutorVersion: baseline.executorVersion, candidateExecutorVersion: attempt.executorVersion } }); }
    const outgoing = pressCreationProcess.edges.filter((edge) => edge.source === node.id);
    let terminalVerdict: "PASS" | "WARN" | "BLOCK" | null = null;
    for (const edge of outgoing) {
      const targetPayload = derivePressTransitionPayload({ edgeId: edge.id, sourceOutput: output, attemptInput: initial as never, selections: { selectedNoteIds: args.input.selectedNoteIds, rewriteInstruction: args.input.rewriteInstruction } });
      const article = await tx.article.findFirst({ where: { id: attempt.articleId, teamId: args.teamId }, select: { id: true, teamId: true, type: true, createdAt: true } });
      const evaluated = evaluatePressTransitionGuardrails({ edgeId: edge.id, sourceInput: nodeInput, sourceOutput: output, targetPayload, attempt: { teamId: args.teamId, articleId: attempt.articleId }, article: article ?? undefined, expectations: Array.isArray((attempt.case?.expectations as any)) ? attempt.case!.expectations as any : [] });
      terminalVerdict = evaluated.verdict;
      const transition = await tx.pressAiDebugTransition.create({ data: { attemptId: attempt.id, edgeId: edge.id, sequence: edge.sequence, sourceNodeId: edge.source, targetNodeId: edge.target, sourceCheckpointId: checkpoint.id, targetPayload: json(targetPayload), verdict: evaluated.verdict } });
      if (attempt.baselineAttemptId) { const baselineTransition = await tx.pressAiDebugTransition.findFirst({ where: { attemptId: attempt.baselineAttemptId, edgeId: edge.id }, orderBy: { createdAt: "desc" } }); if (baselineTransition) await tx.pressAiDebugComparison.updateMany({ where: { candidateAttemptId: attempt.id, candidateCheckpointId: checkpoint.id }, data: { baselineTransitionId: baselineTransition.id, candidateTransitionId: transition.id, oldVerdict: baselineTransition.verdict, newVerdict: transition.verdict } }); }
      await tx.pressAiDebugGuardrailObservation.createMany({ data: evaluated.observations.map((item) => ({ transitionId: transition.id, guardrailId: item.guardrailId, origin: item.origin, expected: item.expected.slice(0, 4000), observed: item.observed.slice(0, 4000), reason: item.reason.slice(0, 4000), evidence: json(item.evidence), verdict: item.verdict, displayOrder: item.displayOrder })) });
      if (evaluated.verdict === "BLOCK") await tx.pressAiDebugCase.upsert({ where: { sourceCheckpointId_captureKind: { sourceCheckpointId: checkpoint.id, captureKind: "AUTOMATIC_BLOCK" } }, update: {}, create: { teamId: args.teamId, createdById: args.userId, name: null, status: "DRAFT", processId: attempt.processId, processVersion: attempt.processVersion, registryHash: attempt.registryHash, sourceAttemptId: attempt.id, sourceCheckpointId: checkpoint.id, startNodeId: node.id, inputSnapshot: json(nodeInput), expectations: [], captureKind: "AUTOMATIC_BLOCK" } });
    }
    const status = outgoing.length === 0 ? "COMPLETED" : terminalVerdict === "BLOCK" ? "BLOCKED" : "INSPECTING";
    await tx.pressAiDebugAttempt.update({ where: { id: attempt.id }, data: { activeNodeId: null, status, terminalVerdict: outgoing.length === 0 ? "PASS" : null, completedAt: outgoing.length === 0 ? new Date() : null, revision: { increment: 1 } } });
    await tx.agentStep.updateMany({ where: { runId: attempt.agentRunId, toolName: node.id, kind: "DOMAIN_PROCESS" }, data: { status: "COMPLETED", inputSummary: json(nodeInput), outputSummary: json(output), startedAt: new Date(), completedAt: new Date() } });
    await tx.agentRun.update({ where: { id: attempt.agentRunId }, data: outgoing.length === 0 ? { status: "COMPLETED", completedAt: new Date(), output: json(output) } : { status: "WAITING_APPROVAL", output: json({ attemptId: attempt.id, checkpointId: checkpoint.id, status }) } });
    await tx.agentRuntimeAuditEvent.create({ data: { teamId: args.teamId, runId: attempt.agentRunId, eventType: "PRESS_AI_CHECKPOINT_COMMAND_V1", details: json({ attemptId: attempt.id, checkpointId: checkpoint.id, commandId: args.input.commandId, kind: "EXECUTE", nodeId: node.id, revision: attempt.revision + 1, ...identity }) } });
    return { attemptId: attempt.id, checkpointId: checkpoint.id, revision: attempt.revision + 1, status };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });
}

export async function advanceCheckpointEdge(args: { teamId: string; userId: string; attemptId: string; edgeId: string; input: z.infer<typeof AdvanceCheckpointEdgeSchema> }) {
  return prisma.$transaction(async (tx) => replayOrRunCommand({ tx, teamId: args.teamId, attemptId: args.attemptId, commandId: args.input.commandId, kind: `ADVANCE:${args.edgeId}`, expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (locked) => {
    const transition = await tx.pressAiDebugTransition.findFirst({ where: { attemptId: args.attemptId, attempt: { teamId: args.teamId }, edgeId: args.edgeId }, orderBy: { createdAt: "desc" }, include: { attempt: { select: { agentRunId: true } } } });
    if (!transition || transition.advancedAt) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_NODE_NOT_ACTIVE");
    const edge = pressCreationProcess.edges.find((item) => item.id === args.edgeId); if (!edge) throw new Error("PRESS_AI_PROCESS_EDGE_INVALID");
    if (transition.verdict === "BLOCK") throw new PressAiDebugConflictError("PRESS_AI_DEBUG_EDGE_BLOCKED");
    if (transition.verdict === "WARN" && !args.input.acknowledgeWarn) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_WARN_ACK_REQUIRED");
    if (edge.humanGate && !args.input.acknowledgeHumanGate) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_HUMAN_ACK_REQUIRED");
    const now = new Date();
    await tx.pressAiDebugTransition.update({ where: { id: transition.id }, data: { warnAcknowledgedById: transition.verdict === "WARN" ? args.userId : undefined, warnAcknowledgedAt: transition.verdict === "WARN" ? now : undefined, humanGateAcknowledgedById: edge.humanGate ? args.userId : undefined, humanGateAcknowledgedAt: edge.humanGate ? now : undefined, advancedById: args.userId, advancedAt: now } });
    await tx.pressAiDebugAttempt.update({ where: { id: args.attemptId }, data: { status: "ACTIVE", activeNodeId: edge.target, revision: { increment: 1 } } });
    await tx.agentRun.update({ where: { id: transition.attempt.agentRunId }, data: { status: "RUNNING", output: json({ attemptId: args.attemptId, activeNodeId: edge.target }) } });
    await tx.agentRuntimeAuditEvent.create({ data: { teamId: args.teamId, runId: transition.attempt.agentRunId, eventType: "PRESS_AI_CHECKPOINT_COMMAND_V1", details: json({ attemptId: args.attemptId, transitionId: transition.id, commandId: args.input.commandId, kind: "ADVANCE", edgeId: edge.id, revision: locked.revision + 1, ...identity }) } });
    return { attemptId: args.attemptId, activeNodeId: edge.target, revision: locked.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
