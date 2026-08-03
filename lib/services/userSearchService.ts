import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

function scoreMatch(q: string, v?: string | null) {
  if (!v) return 0;
  const a = v.toLowerCase();
  const b = q.toLowerCase();
  if (a === b) return 100;
  if (a.startsWith(b)) return 60;
  if (a.includes(b)) return 20;
  return 0;
}

export async function searchUsersForInvite(input: {
  teamId: string;
  userId: string;
  query: string;
}) {
  const myMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: input.teamId, userId: input.userId } },
    select: { role: true },
  });

  if (
    !myMembership ||
    (myMembership.role !== "OWNER" && myMembership.role !== "ADMIN")
  ) {
    throw serviceError(403, "FORBIDDEN", "No permission");
  }

  const q = input.query.trim();
  if (q.length < 2) {
    return { q, users: [] as any[] };
  }

  if (q.includes("@")) {
    return { q, users: [] as any[] };
  }

  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { loginId: { contains: q, mode: "insensitive" } },
        { label: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    select: {
      id: true,
      loginId: true,
      label: true,
      avatarUrl: true,
    },
  });

  const ids = candidates.map((u) => u.id);
  if (ids.length === 0) {
    return { q, users: [] as any[] };
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: input.teamId, userId: { in: ids } },
    select: { userId: true },
  });
  const memberSet = new Set(members.map((m) => m.userId));

  const pendingInvs = await prisma.teamInvitation.findMany({
    where: {
      teamId: input.teamId,
      status: "PENDING",
      inviteeUserId: { in: ids },
    },
    select: { inviteeUserId: true },
  });
  const invitedSet = new Set(
    pendingInvs.map((i) => i.inviteeUserId!).filter(Boolean)
  );

  const ranked = candidates
    .map((u) => {
      return {
        ...u,
        alreadyMember: memberSet.has(u.id),
        alreadyInvited: invitedSet.has(u.id),
      };
    })
    .sort((a, b) => {
      const sa = scoreMatch(q, a.loginId) + scoreMatch(q, a.label);
      const sb = scoreMatch(q, b.loginId) + scoreMatch(q, b.label);
      return sb - sa;
    })
    .slice(0, 10);

  return { q, users: ranked };
}
