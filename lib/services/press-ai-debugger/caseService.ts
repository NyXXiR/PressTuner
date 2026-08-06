import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json } from "./checkpointRepository";
import { replayOrRunCommand } from "./commandRepository";
import { findDebugCase, listDebugCases as listDebugCasesFromRepository } from "./caseRepository";

export const DebugCaseExpectationSchema = z.object({ id: z.string().min(1).max(100), field: z.enum(["contains", "notContains"]), value: z.string().min(1).max(1000), verdict: z.enum(["WARN", "BLOCK"]).optional() }).strict();
export const SaveDebugCaseSchema = z.object({ commandId: z.string().min(8).max(100), expectedRevision: z.number().int().nonnegative(), checkpointId: z.string().min(1), name: z.string().trim().min(1).max(120), expectations: z.array(DebugCaseExpectationSchema).max(50).default([]) }).strict();

export async function saveManualDebugCase(args: { teamId: string; userId: string; attemptId: string; input: z.infer<typeof SaveDebugCaseSchema> }) {
  return prisma.$transaction(async (tx) => replayOrRunCommand({ tx, teamId: args.teamId, attemptId: args.attemptId, commandId: args.input.commandId, kind: "SAVE_CASE", expectedRevision: args.input.expectedRevision, request: args.input, mutate: async (locked) => {
    const checkpoint = await tx.pressAiDebugCheckpoint.findFirst({ where: { id: args.input.checkpointId, attemptId: args.attemptId, attempt: { teamId: args.teamId } }, include: { attempt: true } });
    if (!checkpoint) throw Object.assign(new Error("PRESS_AI_DEBUG_CHECKPOINT_NOT_FOUND"), { status: 404 });
    const saved = await tx.pressAiDebugCase.upsert({ where: { sourceCheckpointId_captureKind: { sourceCheckpointId: checkpoint.id, captureKind: "MANUAL" } }, update: { name: args.input.name, status: "SAVED", expectations: json(args.input.expectations) }, create: { teamId: args.teamId, createdById: args.userId, name: args.input.name, status: "SAVED", processId: checkpoint.attempt.processId, processVersion: checkpoint.processVersion, registryHash: checkpoint.registryHash, sourceAttemptId: args.attemptId, sourceCheckpointId: checkpoint.id, startNodeId: checkpoint.nodeId, inputSnapshot: json(checkpoint.input), expectations: json(args.input.expectations), captureKind: "MANUAL" } });
    await tx.pressAiDebugAttempt.update({ where: { id: args.attemptId }, data: { revision: { increment: 1 } } });
    return { caseId: saved.id, revision: locked.revision + 1 };
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getDebugCase(args: { teamId: string; caseId: string }) { const value = await findDebugCase(args.teamId, args.caseId); if (!value) throw Object.assign(new Error("PRESS_AI_DEBUG_CASE_NOT_FOUND"), { status: 404 }); return value; }
export async function listDebugCases(teamId: string) { return listDebugCasesFromRepository(teamId); }
