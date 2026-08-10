import { prisma } from "@/lib/prisma";
export async function findDebugCase(teamId: string, caseId: string) {
  const debugCase = await prisma.pressAiDebugCase.findFirst({ where: { id: caseId, teamId }, include: { sourceCheckpoint: true } });
  if (!debugCase) return null;
  const observations = await prisma.pressAiDebugGuardrailObservation.findMany({ where: { origin: "CASE_EXPECTATION", transition: { attempt: { caseId, teamId } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, guardrailId: true, origin: true, verdict: true, evidence: true, createdAt: true, transition: { select: { edgeId: true, attemptId: true } } } });
  return { ...debugCase, observations };
}
export async function listDebugCases(teamId: string) { return prisma.pressAiDebugCase.findMany({ where: { teamId }, orderBy: { createdAt: "desc" }, take: 50 }); }
