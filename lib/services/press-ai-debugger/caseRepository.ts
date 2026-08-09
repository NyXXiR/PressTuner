import { prisma } from "@/lib/prisma";
export async function findDebugCase(teamId: string, caseId: string) { return prisma.pressAiDebugCase.findFirst({ where: { id: caseId, teamId }, include: { sourceCheckpoint: true, guardrails: { orderBy: { displayOrder: "asc" } } } }); }
export async function listDebugCases(teamId: string) { return prisma.pressAiDebugCase.findMany({ where: { teamId }, orderBy: { createdAt: "desc" }, take: 50 }); }
