import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json } from "./checkpointRepository";
import { replayOrRunCommand } from "./commandRepository";
import { findDebugCase, listDebugCases as listDebugCasesFromRepository } from "./caseRepository";
import { mapDatasetItemCaptured } from "@/domain/ai-telemetry/pressMapper";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";
import { CustomExpectationSchema, CustomExpectationsSchema, customExpectationFingerprint, deriveExpectationValidation, normalizeCustomExpectations } from "@/domain/press-ai-debugger/caseExpectations";

export const DebugCaseExpectationSchema = CustomExpectationSchema;
export const SaveDebugCaseSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative(), checkpointId: z.string().min(1), name: z.string().trim().min(1).max(120), expectations: CustomExpectationsSchema.default([]) }).strict();

export async function saveManualDebugCase(args: { teamId: string; userId: string; attemptId: string; input: z.infer<typeof SaveDebugCaseSchema> }) {
  return prisma.$transaction(async (tx) => replayOrRunCommand({ tx, teamId: args.teamId, attemptId: args.attemptId, commandId: args.input.commandId, kind: "SAVE_CASE", expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (locked) => {
    const checkpoint = await tx.pressAiDebugCheckpoint.findFirst({ where: { id: args.input.checkpointId, attemptId: args.attemptId, attempt: { teamId: args.teamId } }, include: { attempt: true } });
    if (!checkpoint) throw Object.assign(new Error("PRESS_AI_DEBUG_CHECKPOINT_NOT_FOUND"), { status: 404 });
    const normalized = normalizeCustomExpectations(args.input.expectations);
    const attachedCaseId = checkpoint.attempt.caseId;
    const attached = attachedCaseId ? await tx.pressAiDebugCase.findFirst({ where: { id: attachedCaseId, teamId: args.teamId } }) : null;
    if (attachedCaseId && !attached) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_NOT_FOUND"), { status: 404 });
    const saved = attached
      ? await tx.pressAiDebugCase.update({ where: { id: attached.id }, data: { name: args.input.name, status: "SAVED", expectations: json(normalized) } })
      : await tx.pressAiDebugCase.upsert({ where: { sourceCheckpointId_captureKind: { sourceCheckpointId: checkpoint.id, captureKind: "MANUAL" } }, update: { name: args.input.name, status: "SAVED", expectations: json(normalized) }, create: { teamId: args.teamId, createdById: args.userId, name: args.input.name, status: "SAVED", processId: checkpoint.attempt.processId, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash, sourceAttemptId: args.attemptId, sourceCheckpointId: checkpoint.id, startNodeId: checkpoint.nodeId, inputSnapshot: json(checkpoint.input), expectations: json(normalized), captureKind: "MANUAL" } });
    await tx.pressAiDebugAttempt.update({ where: { id: args.attemptId }, data: { caseId: saved.id, revision: { increment: 1 } } });
    const run = await tx.agentRun.findUnique({ where: { id: checkpoint.attempt.agentRunId }, select: { traceId: true } });
    await appendCanonicalEvent(tx, mapDatasetItemCaptured({ teamId: args.teamId, runId: checkpoint.attempt.agentRunId, traceId: run?.traceId, attemptId: args.attemptId, caseId: saved.id, processId: checkpoint.attempt.processId, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash }, { caseId: saved.id, checkpointId: checkpoint.id, captureKind: "MANUAL" }));
    return { caseId: saved.id, revision: locked.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getDebugCase(args: { teamId: string; caseId: string }) {
  const value = await findDebugCase(args.teamId, args.caseId); if (!value) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_NOT_FOUND"), { status: 404 });
  const expectations = normalizeCustomExpectations(value.expectations);
  return { caseId: value.id, name: value.name ?? "", sourceCheckpointId: value.sourceCheckpoint.id, sourceCheckpoint: { id: value.sourceCheckpoint.id, nodeId: value.sourceCheckpoint.nodeId }, startNodeId: value.startNodeId, expectations: expectations.map((expectation) => { const fingerprint = customExpectationFingerprint(expectation); const validation = deriveExpectationValidation(fingerprint, value.observations); return { ...expectation, fingerprint, validation, validationState: validation.state, lastVerdict: validation.lastVerdict, lastObservationAt: validation.lastObservationAt }; }), observations: value.observations.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
}
export async function listDebugCases(teamId: string) { return listDebugCasesFromRepository(teamId); }
