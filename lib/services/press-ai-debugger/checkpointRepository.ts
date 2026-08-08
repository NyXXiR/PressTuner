import { Prisma } from "@prisma/client";
import { boundProcessDetail } from "@/domain/press-ai-debugger/processDetails";
import { prisma } from "@/lib/prisma";

export const checkpointAttemptInclude = { checkpoints: { orderBy: { sequence: "asc" as const } }, transitions: { orderBy: { sequence: "asc" as const }, include: { observations: { orderBy: { displayOrder: "asc" as const } } } } };
export async function findCheckpointAttempt(teamId: string, attemptId: string) { return prisma.pressAiDebugAttempt.findFirst({ where: { id: attemptId, teamId }, include: checkpointAttemptInclude }); }
export async function listCheckpointAttempts(teamId: string) { return prisma.pressAiDebugAttempt.findMany({ where: { teamId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, processId: true, processVersion: true, status: true, revision: true, articleId: true, activeNodeId: true, parentAttemptId: true, createdAt: true, completedAt: true, inputSnapshot: true, _count: { select: { checkpoints: true } } } }); }
export function publicCheckpointAttempt(value: unknown) { return boundProcessDetail(value); }
function boundStoredCheckpoint(value: unknown, depth = 0): unknown { if (depth > 8) return "[truncated]"; if (value instanceof Date) return value.toISOString(); if (typeof value === "string") return value.slice(0, 12_000); if (Array.isArray(value)) return value.slice(0, 200).map((item) => boundStoredCheckpoint(item, depth + 1)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 200).map(([key, item]) => [key, boundStoredCheckpoint(item, depth + 1)])); return value; }
export function json(value: unknown) { return boundStoredCheckpoint(value) as Prisma.InputJsonValue; }
