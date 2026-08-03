import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  createTeamInvitation,
  respondInvitation,
  transferTeamOwnership,
  updateTeamMemberRole,
} from "@/lib/services/team/teamService";

async function createTeamFixture() {
  const suffix = randomUUID();
  const [first, second] = await Promise.all([
    prisma.user.create({
      data: { loginId: `team-lock-a-${suffix}`, label: "Owner A" },
    }),
    prisma.user.create({
      data: { loginId: `team-lock-b-${suffix}`, label: "Owner B" },
    }),
  ]);
  const team = await prisma.team.create({
    data: {
      name: `team-lock-${suffix}`,
      slug: `team-lock-${suffix}`,
      members: {
        create: [
          { userId: first.id, role: "OWNER" },
          { userId: second.id, role: "OWNER" },
        ],
      },
    },
  });
  return { first, second, team };
}

test("concurrent OWNER demotions cannot remove the final owner", async () => {
  const fixture = await createTeamFixture();
  try {
    const results = await Promise.allSettled([
      updateTeamMemberRole({
        teamId: fixture.team.id,
        userId: fixture.first.id,
        targetUserId: fixture.second.id,
        nextRole: "MEMBER",
      }),
      updateTeamMemberRole({
        teamId: fixture.team.id,
        userId: fixture.second.id,
        targetUserId: fixture.first.id,
        nextRole: "MEMBER",
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      await prisma.teamMember.count({
        where: { teamId: fixture.team.id, role: "OWNER" },
      }),
      1,
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: fixture.team.id } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.first.id, fixture.second.id] } } });
  }
});

test("concurrent invitation responses claim a PENDING invitation once", async () => {
  const fixture = await createTeamFixture();
  try {
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: fixture.team.id, userId: fixture.second.id } },
      data: { role: "MEMBER" },
    });
    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: fixture.team.id, userId: fixture.second.id } },
    });
    const created = await createTeamInvitation({
      teamId: fixture.team.id,
      inviterId: fixture.first.id,
      inviteeUserId: fixture.second.id,
    });

    const results = await Promise.allSettled([
      respondInvitation({
        userId: fixture.second.id,
        invitationId: created.invitationId,
        action: "ACCEPT",
      }),
      respondInvitation({
        userId: fixture.second.id,
        invitationId: created.invitationId,
        action: "REJECT",
      }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const invitation = await prisma.teamInvitation.findUniqueOrThrow({
      where: { id: created.invitationId },
    });
    assert.ok(invitation.status === "ACCEPTED" || invitation.status === "REJECTED");
    const memberCount = await prisma.teamMember.count({
      where: { teamId: fixture.team.id, userId: fixture.second.id },
    });
    assert.equal(memberCount, invitation.status === "ACCEPTED" ? 1 : 0);
  } finally {
    await prisma.team.deleteMany({ where: { id: fixture.team.id } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.first.id, fixture.second.id] } } });
  }
});

test("concurrent invitation creation produces one pending invitation", async () => {
  const fixture = await createTeamFixture();
  try {
    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: fixture.team.id, userId: fixture.second.id } },
    });
    const results = await Promise.allSettled([
      createTeamInvitation({
        teamId: fixture.team.id,
        inviterId: fixture.first.id,
        inviteeUserId: fixture.second.id,
      }),
      createTeamInvitation({
        teamId: fixture.team.id,
        inviterId: fixture.first.id,
        inviteeUserId: fixture.second.id,
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
      await prisma.teamInvitation.count({
        where: {
          teamId: fixture.team.id,
          inviteeUserId: fixture.second.id,
          status: "PENDING",
        },
      }),
      1,
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: fixture.team.id } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.first.id, fixture.second.id] } } });
  }
});

test("ownership cannot be transferred to the current owner", async () => {
  await assert.rejects(
    transferTeamOwnership({ teamId: "unused", currentUserId: "same", targetUserId: "same" }),
    (error: Error & { code?: string }) => error.code === "OWNERSHIP_TRANSFER_TO_SELF",
  );
});
