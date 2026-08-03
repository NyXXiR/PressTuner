import { Prisma, TeamRole } from "@prisma/client";
import { nanoid } from "nanoid";

import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

function isAdminOrOwner(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

function isAdmin(role: string) {
  return isAdminOrOwner(role);
}

async function lockTeamForMembershipChange(tx: Prisma.TransactionClient, teamId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "team" WHERE id = ${teamId} FOR UPDATE
  `;
  if (rows.length === 0) {
    throw serviceError(404, "TEAM_NOT_FOUND", "Team not found");
  }
}

export async function listTeamMembers(input: {
  userId: string;
  teamId: string;
}) {
  const myMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    select: { role: true },
  });

  if (!myMembership) {
    throw serviceError(403, "FORBIDDEN", "Not a member of current team");
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: input.teamId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          loginId: true,
          label: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
    },
  });

  return {
    teamId: input.teamId,
    myRole: myMembership.role,
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.createdAt,
      user: m.user,
    })),
  };
}

export async function updateTeamMemberRole(input: {
  teamId: string;
  userId: string;
  targetUserId: string;
  nextRole: string;
}) {
  const allowed = new Set(["OWNER", "ADMIN", "MEMBER", "GUEST"]);
  if (!allowed.has(input.nextRole)) {
    throw serviceError(
      400,
      "INVALID_ROLE",
      "role은 OWNER|ADMIN|MEMBER|GUEST 중 하나여야 합니다."
    );
  }

  if (input.nextRole === "OWNER") {
    throw serviceError(
      400,
      "OWNER_ONLY_TRANSFER",
      "OWNER 권한은 '소유권 이전'으로만 변경할 수 있습니다."
    );
  }

  await prisma.$transaction(async (tx) => {
    await lockTeamForMembershipChange(tx, input.teamId);
    const [myMembership, targetMembership] = await Promise.all([
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
        select: { role: true },
      }),
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.targetUserId } },
        select: { role: true },
      }),
    ]);
    if (!myMembership || !isAdminOrOwner(myMembership.role)) {
      throw serviceError(403, "FORBIDDEN", "No permission");
    }
    if (!targetMembership) {
      throw serviceError(404, "NOT_FOUND", "Target is not a member");
    }
    if (targetMembership.role === "OWNER") {
      if (myMembership.role !== "OWNER") {
        throw serviceError(403, "FORBIDDEN", "Only an OWNER can demote another OWNER.");
      }
      const ownersCount = await tx.teamMember.count({
        where: { teamId: input.teamId, role: "OWNER" },
      });
      if (ownersCount <= 1) {
        throw serviceError(409, "LAST_OWNER_PROTECTED", "The last OWNER cannot be demoted.");
      }
    }
    await tx.teamMember.update({
      where: { teamId_userId: { teamId: input.teamId, userId: input.targetUserId } },
      data: { role: input.nextRole as TeamRole },
    });
  });

  return { ok: true };
}

export async function removeTeamMember(input: {
  teamId: string;
  userId: string;
  targetUserId: string;
}) {
  await prisma.$transaction(async (tx) => {
    await lockTeamForMembershipChange(tx, input.teamId);
    const [myMembership, targetMembership] = await Promise.all([
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
        select: { role: true },
      }),
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.targetUserId } },
        select: { role: true },
      }),
    ]);
    if (!myMembership) throw serviceError(403, "FORBIDDEN", "Not a member");
    if (!targetMembership) throw serviceError(404, "NOT_FOUND", "Target is not a member");
    const isSelf = input.targetUserId === input.userId;
    if (!isSelf && !isAdminOrOwner(myMembership.role)) {
      throw serviceError(403, "FORBIDDEN", "No permission");
    }
    if (!isSelf && targetMembership.role === "OWNER" && myMembership.role !== "OWNER") {
      throw serviceError(403, "FORBIDDEN", "Only OWNER can remove an OWNER");
    }
    if (targetMembership.role === "OWNER") {
      const ownersCount = await tx.teamMember.count({
        where: { teamId: input.teamId, role: "OWNER" },
      });
      if (ownersCount <= 1) {
        throw serviceError(409, "LAST_OWNER_PROTECTED", "The last OWNER cannot leave or be removed.");
      }
    }
    await tx.teamMember.delete({
      where: { teamId_userId: { teamId: input.teamId, userId: input.targetUserId } },
    });
  });

  return { ok: true };
}

export async function createTeamInvitation(input: {
  teamId: string;
  inviterId: string;
  inviteeUserId: string;
  message?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockTeamForMembershipChange(tx, input.teamId);
    const [myMembership, already, pending, invitee] = await Promise.all([
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.inviterId } },
        select: { role: true },
      }),
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.inviteeUserId } },
        select: { userId: true },
      }),
      tx.teamInvitation.findFirst({
        where: {
          teamId: input.teamId,
          inviteeUserId: input.inviteeUserId,
          status: "PENDING",
        },
        select: { id: true },
      }),
      tx.user.findUnique({
        where: { id: input.inviteeUserId },
        select: { id: true, label: true },
      }),
    ]);
    if (!myMembership || !isAdminOrOwner(myMembership.role)) {
      throw serviceError(403, "FORBIDDEN", "No permission");
    }
    if (already) throw serviceError(409, "ALREADY_MEMBER", "Already a member");
    if (pending) throw serviceError(409, "ALREADY_INVITED", "Already invited");
    if (!invitee) throw serviceError(404, "USER_NOT_FOUND", "User not found");

    const invitation = await tx.teamInvitation.create({
      data: {
        teamId: input.teamId,
        inviterId: input.inviterId,
        inviteeUserId: input.inviteeUserId,
        inviteeLabel: invitee.label,
        message: input.message,
      },
    });
    await tx.notification.create({
      data: {
        type: "INVITATION",
        teamId: input.teamId,
        userId: input.inviteeUserId,
        title: "팀 초대",
        body: null,
        href: "/my/notifications",
        bannerText: "새 팀 초대가 도착했어요.",
        invitationId: invitation.id,
        isActive: true,
      },
    });
    return { ok: true, invitationId: invitation.id };
  });
}

export async function resolveUserIdByLoginId(loginId: string) {
  const user = await prisma.user.findUnique({
    where: { loginId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function listInvitationInbox(input: { userId: string }) {
  const invitations = await prisma.teamInvitation.findMany({
    where: {
      inviteeUserId: input.userId,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: {
      team: { select: { id: true, name: true, slug: true } },
      inviter: { select: { id: true, label: true, email: true } },
    },
  });

  return { ok: true, invitations };
}

export async function listInvitationOutbox(input: {
  userId: string;
  teamId: string;
}) {
  const myMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    select: { role: true },
  });

  if (!myMembership) {
    throw serviceError(403, "FORBIDDEN", "Not a member");
  }

  const canViewAll = isAdminOrOwner(myMembership.role);

  const invitations = await prisma.teamInvitation.findMany({
    where: {
      teamId: input.teamId,
      status: "PENDING",
      ...(canViewAll ? {} : { inviterId: input.userId }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      message: true,
      inviteeUserId: true,
      inviteeLabel: true,
      inviter: { select: { id: true, label: true } },
      invitee: {
        select: {
          id: true,
          label: true,
          loginId: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  return { ok: true, invitations };
}

export async function respondInvitation(input: {
  userId: string;
  invitationId: string;
  action: "ACCEPT" | "REJECT";
}) {
  const inv = await prisma.teamInvitation.findUnique({
    where: { id: input.invitationId },
    select: {
      id: true,
      teamId: true,
      inviterId: true,
      inviteeUserId: true,
      status: true,
    },
  });

  if (!inv) {
    throw serviceError(
      404,
      "NOT_FOUND",
      `Invitation not found: ${input.invitationId}`
    );
  }

  if (inv.status !== "PENDING") {
    throw serviceError(
      409,
      "INVITATION_NOT_PENDING",
      `Invitation is not pending (status=${inv.status})`
    );
  }

  if (inv.inviteeUserId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "Forbidden");
  }

  if (input.action === "REJECT") {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.teamInvitation.updateMany({
        where: { id: input.invitationId, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (claimed.count !== 1) {
        throw serviceError(409, "INVITATION_NOT_PENDING", "Invitation is no longer pending");
      }
      await tx.notification.updateMany({
        where: { type: "INVITATION", invitationId: input.invitationId },
        data: { isActive: false },
      });
    });

    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.teamInvitation.updateMany({
      where: { id: input.invitationId, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    if (claimed.count !== 1) {
      throw serviceError(409, "INVITATION_NOT_PENDING", "Invitation is no longer pending");
    }
    await tx.teamMember.upsert({
      where: { teamId_userId: { teamId: inv.teamId, userId: input.userId } },
      create: { teamId: inv.teamId, userId: input.userId, role: "MEMBER" },
      update: {},
    });
    await tx.notification.updateMany({
      where: { type: "INVITATION", invitationId: input.invitationId },
      data: { isActive: false },
    });
  });

  return { ok: true };
}

export async function cancelInvitation(input: {
  userId: string;
  currentTeamId: string;
  invitationId: string;
}) {
  const inv = await prisma.teamInvitation.findUnique({
    where: { id: input.invitationId },
    select: { id: true, teamId: true, inviterId: true, status: true },
  });

  if (!inv || inv.status !== "PENDING") {
    throw serviceError(400, "INVALID_INVITATION", "Invalid invitation");
  }

  if (!input.currentTeamId || input.currentTeamId !== inv.teamId) {
    throw serviceError(400, "NO_TEAM_OR_MISMATCH", "No current team or team mismatch");
  }

  if (inv.inviterId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "Not inviter");
  }

  const myMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: inv.teamId, userId: input.userId } },
    select: { role: true },
  });

  const canCancel =
    myMembership?.role === "OWNER" || myMembership?.role === "ADMIN";
  if (!canCancel) {
    throw serviceError(403, "FORBIDDEN", "No permission to cancel");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.teamInvitation.updateMany({
      where: { id: input.invitationId, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    if (claimed.count !== 1) {
      throw serviceError(409, "INVITATION_NOT_PENDING", "Invitation is no longer pending");
    }
    await tx.notification.updateMany({
      where: { type: "INVITATION", invitationId: input.invitationId },
      data: { isActive: false },
    });
  });

  return { ok: true };
}

export async function selectTeamForSession(input: {
  sessionId: string;
  userId: string;
  teamId: string;
}) {
  if (!input.teamId) {
    throw serviceError(400, "MISSING_TEAM_ID", "teamId가 필요합니다.");
  }

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    select: { teamId: true },
  });

  if (!membership) {
    throw serviceError(403, "FORBIDDEN", "해당 팀에 소속되어 있지 않습니다.");
  }

  await prisma.session.update({
    where: { id: input.sessionId },
    data: { currentTeamId: input.teamId },
  });

  return { ok: true };
}

export async function transferTeamOwnership(input: {
  teamId: string;
  currentUserId: string;
  targetUserId: string;
}) {
  if (input.currentUserId === input.targetUserId) {
    throw serviceError(400, "OWNERSHIP_TRANSFER_TO_SELF", "Ownership must be transferred to another member.");
  }
  await prisma.$transaction(async (tx) => {
    await lockTeamForMembershipChange(tx, input.teamId);
    const [myMembership, targetMembership] = await Promise.all([
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.currentUserId } },
        select: { role: true },
      }),
      tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: input.teamId, userId: input.targetUserId } },
        select: { role: true },
      }),
    ]);
    if (myMembership?.role !== "OWNER") {
      throw serviceError(403, "FORBIDDEN", "Only OWNER can transfer ownership");
    }
    if (!targetMembership) {
      throw serviceError(404, "NOT_FOUND", "Target is not a member");
    }
    await tx.teamMember.update({
      where: { teamId_userId: { teamId: input.teamId, userId: input.targetUserId } },
      data: { role: "OWNER" },
    });
    await tx.teamMember.update({
      where: { teamId_userId: { teamId: input.teamId, userId: input.currentUserId } },
      data: { role: "ADMIN" },
    });
  });

  return { ok: true };
}

export async function updateTeamSettings(input: {
  teamId: string;
  userId: string;
  name?: string;
  allowMemberEdit?: boolean;
  allowMemberFinalize?: boolean;
}) {
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId: input.teamId,
        userId: input.userId,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    throw serviceError(403, "FORBIDDEN", "해당 팀의 멤버가 아닙니다.");
  }

  const wantsNameUpdate = typeof input.name !== "undefined";
  const wantsPolicyUpdate =
    typeof input.allowMemberEdit !== "undefined" ||
    typeof input.allowMemberFinalize !== "undefined";

  if (wantsNameUpdate && membership.role !== "OWNER") {
    throw serviceError(
      403,
      "FORBIDDEN",
      "팀 소유자(OWNER)만 이름을 변경할 수 있습니다."
    );
  }

  if (wantsPolicyUpdate && !isAdmin(membership.role)) {
    throw serviceError(
      403,
      "FORBIDDEN",
      "팀 관리자(OWNER/ADMIN)만 권한 정책을 변경할 수 있습니다."
    );
  }

  await prisma.team.update({
    where: { id: input.teamId },
    data: {
      ...(wantsNameUpdate ? { name: input.name?.trim() } : {}),
      ...(typeof input.allowMemberEdit === "boolean"
        ? { allowMemberEdit: input.allowMemberEdit }
        : {}),
      ...(typeof input.allowMemberFinalize === "boolean"
        ? { allowMemberFinalize: input.allowMemberFinalize }
        : {}),
    },
  });

  return { ok: true };
}

export { serviceError };

export type MyTeamDto = {
  id: string;
  name: string;
  slug: string;
  role: string;
  memberCount: number;
  createdAt: Date;
  isCurrent: boolean;
};

export async function createTeam(input: { userId: string; name: string }) {
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw serviceError(400, "INVALID_TEAM_NAME", "Team name must be at least two characters.");
  }
  const safeName = trimmedName
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10)
    .toLowerCase();
  const slug = `${safeName || "team"}-${nanoid(6)}`;

  return prisma.team.create({
    data: {
      name: trimmedName,
      slug,
      plan: "FREE",
      planCategory: "STANDARD",
      members: { create: { userId: input.userId, role: "OWNER" } },
      productSubscriptions: {
        create: [
          { product: "PRESS", planId: "free_v1", plan: "FREE" },
          { product: "CAREER", planId: "free_v1", plan: "FREE" },
        ],
      },
    },
  });
}

export async function deleteTeam(input: { teamId: string; userId: string }) {
  await prisma.$transaction(async (tx) => {
    await lockTeamForMembershipChange(tx, input.teamId);
    const member = await tx.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
      select: { role: true },
    });
    if (member?.role !== "OWNER") {
      throw serviceError(403, "FORBIDDEN", "Only an OWNER can delete a team.");
    }
    await tx.team.delete({ where: { id: input.teamId } });
  });
  return true;
}
