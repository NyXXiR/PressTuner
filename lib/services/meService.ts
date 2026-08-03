import { isSuperAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUsageSummaryForTeam } from "@/lib/services/usageService";
import { serviceError } from "@/lib/services/serviceError";
import type { Session } from "@/lib/session";

export async function updateUserLabel(userId: string, label: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { label: label.trim() },
  });
}

export async function setUserWithdrawalSchedule(userId: string, date: Date | null) {
  await prisma.user.update({
    where: { id: userId },
    data: { deleteScheduledAt: date },
  });
}

export async function getMePayload(session: Session) {
  const userId = session.userId;

  const freshUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { deleteScheduledAt: true },
  });

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          slug: true,
          name: true,
          plan: true,
          planId: true,
          membershipStatus: true,
          planExpiresAt: true,
          nextBillingAt: true,
          pendingPlan: true,
          pendingPlanStartsAt: true,
          cancelRequestedAt: true,
          credits: true,
          allowMemberEdit: true,
          allowMemberFinalize: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    throw serviceError(400, "NO_TEAM", "소속된 팀이 없습니다.");
  }

  let currentTeamId = session.currentTeamId ?? null;
  const validCurrentTeam =
    currentTeamId && memberships.some((m) => m.teamId === currentTeamId);

  if (!validCurrentTeam) {
    currentTeamId = memberships[0].teamId;
    await prisma.session.update({
      where: { id: session.id },
      data: { currentTeamId },
    });
  }

  const currentTeam = memberships.find((m) => m.teamId === currentTeamId)!.team;
  const usage = await getUsageSummaryForTeam(currentTeam.id);

  return {
    isSuperAdmin: isSuperAdminEmail(session.user.email),
    user: {
      id: session.user.id,
      loginId: session.user.loginId,
      label: session.user.label,
      email: session.user.email,
      avatarUrl: session.user.avatarUrl,
      deleteScheduledAt: freshUser?.deleteScheduledAt
        ? freshUser.deleteScheduledAt.toISOString()
        : null,
    },
    team: {
      id: currentTeam.id,
      slug: currentTeam.slug,
      name: currentTeam.name,
      plan: currentTeam.plan,
      planId: currentTeam.planId,
      membershipStatus: currentTeam.membershipStatus,
      planExpiresAt: currentTeam.planExpiresAt
        ? currentTeam.planExpiresAt.toISOString()
        : null,
      nextBillingAt: currentTeam.nextBillingAt
        ? currentTeam.nextBillingAt.toISOString()
        : null,
      pendingPlan: currentTeam.pendingPlan,
      pendingPlanStartsAt: currentTeam.pendingPlanStartsAt
        ? currentTeam.pendingPlanStartsAt.toISOString()
        : null,
      cancelRequestedAt: currentTeam.cancelRequestedAt
        ? currentTeam.cancelRequestedAt.toISOString()
        : null,
      credits: currentTeam.credits,
      allowMemberEdit: currentTeam.allowMemberEdit,
      allowMemberFinalize: currentTeam.allowMemberFinalize,
    },
    teams: memberships.map((m) => ({
      id: m.team.id,
      slug: m.team.slug,
      name: m.team.name,
      role: m.role,
      plan: m.team.plan,
    })),
    usage,
  };
}
