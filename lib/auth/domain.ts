// lib/auth/domain.ts
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type StatusError = Error & { status?: number; code?: string };
function err(code: string, status: number): StatusError {
  const e = new Error(code) as StatusError;
  e.code = code;
  e.status = status;
  return e;
}

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw err("UNAUTHORIZED", 401);
  return session;
}

export async function requireTeamSession() {
  const session = await requireSession();
  const teamId = session.currentTeamId;
  if (!teamId) throw err("TEAM_NOT_SELECTED", 409);

  // 멤버십/role 확인
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: session.userId } },
    select: { role: true },
  });
  if (!member) throw err("FORBIDDEN", 403);

  return {
    session,
    userId: session.userId,
    teamId,
    role: member.role, // OWNER | ADMIN | MEMBER | GUEST
  };
}

export function assertAdmin(role: string) {
  if (role !== "OWNER" && role !== "ADMIN") throw err("FORBIDDEN", 403);
}
