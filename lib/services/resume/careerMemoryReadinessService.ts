import { prisma } from "@/lib/prisma";
import { projectCareerRegistrationReadiness } from "@/domain/career-memory/registrationReadiness";

export async function getCareerMemoryReadiness(userId: string) {
  const [
    confirmedExperienceCount,
    trustedFactCount,
    pendingCandidateCount,
    processingSourceCount,
    failedSourceCount,
  ] = await Promise.all([
    prisma.experienceBrick.count({
      where: { userId, memoryStatus: "CONFIRMED" },
    }),
    prisma.careerFact.count({
      where: { userId, active: true, trustStatus: "TRUSTED" },
    }),
    prisma.careerExperienceCandidate.count({
      where: { userId, status: "PENDING" },
    }),
    prisma.careerSource.count({
      where: {
        userId,
        deletedAt: null,
        status: { in: ["QUEUED", "PARSING", "INDEXING", "EXTRACTING"] },
      },
    }),
    prisma.careerSource.count({
      where: {
        userId,
        deletedAt: null,
        status: "FAILED",
      },
    }),
  ]);
  const projected = projectCareerRegistrationReadiness({
    confirmedExperienceCount,
    trustedFactCount,
    pendingCandidateCount,
    processingSourceCount,
    failedSourceCount,
  });
  return {
    ...projected,
    status: projected.registrationStatus,
    confirmedExperienceCount,
    trustedFactCount,
    pendingCandidateCount,
    processingSourceCount,
    failedSourceCount,
    recoveryHref: "/resume/bricks" as const,
  };
}
