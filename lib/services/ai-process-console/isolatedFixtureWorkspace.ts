import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type IsolatedFixtureWorkspace = Readonly<{ teamId: string; userId: string }>;

function safeSuffix(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export async function createIsolatedFixtureWorkspace(testRunId: string): Promise<IsolatedFixtureWorkspace> {
  const suffix = safeSuffix(testRunId);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { loginId: `aipc-${suffix}`, label: "AI Process Console synthetic runner", isActive: false } });
      const team = await tx.team.create({ data: { slug: `aipc-${suffix}`, name: "AI Process Console synthetic workspace", planId: "free_v1", plan: "FREE", planCategory: "PRESS", membershipStatus: "ACTIVE", limitArticleMonthly: 1000, limitResumeMonthly: 0, allowMemberEdit: false, allowMemberFinalize: false } });
      await tx.teamMember.create({ data: { teamId: team.id, userId: user.id, role: "OWNER" } });
      return Object.freeze({ teamId: team.id, userId: user.id });
    });
  } catch (error) {
    throw Object.assign(new Error("AI_PROCESS_ISOLATION_UNAVAILABLE"), { cause: error, code: "ISOLATION_UNAVAILABLE" });
  }
}

export async function cleanupIsolatedFixtureWorkspace(workspace: IsolatedFixtureWorkspace): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: workspace.teamId }, select: { id: true, slug: true } });
    const user = await tx.user.findUnique({ where: { id: workspace.userId }, select: { id: true, loginId: true } });
    if (team && !team.slug.startsWith("aipc-")) throw new Error("AI_PROCESS_ISOLATION_BOUNDARY_VIOLATION");
    if (user && !user.loginId.startsWith("aipc-")) throw new Error("AI_PROCESS_ISOLATION_BOUNDARY_VIOLATION");
    if (team) await tx.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    if (team) await tx.team.delete({ where: { id: team.id } });
    if (user) await tx.user.delete({ where: { id: user.id } });
  });
}
