// lib/auth.ts
import { prisma } from "@/lib/prisma";
import {
  getSession,
  SESSION_COOKIE_NAME as SID_COOKIE_NAME,
} from "@/lib/session";
import { TeamRole } from "@prisma/client";
import { trackOpsEvent } from "@/lib/ops";

// ✅ 기존 코드가 SESSION_COOKIE_NAME를 import하고 있을 수 있으니 alias로 유지
export const SESSION_COOKIE_NAME = SID_COOKIE_NAME;

function err(status: number, message: string) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

export async function getCurrentUserId() {
  const session = await getSession();
  return session?.userId ?? null;
}

export async function requireCurrentUserId() {
  const session = await getSession();
  if (!session?.userId) throw err(401, "UNAUTHORIZED");
  return session.userId;
}

/**
 * ✅ (경량) 세션에서 user/team 바로 꺼내기
 * - getSession() 자체가 include { user, team } 이므로 보통 이걸로 충분
 */
export async function getSessionContext() {
  const session = await getSession();
  if (!session) return null;
  return {
    session,
    user: session.user, // memberships 없음(경량)
    team: session.team ?? null, // currentTeamId relation
  };
}

export async function requireSessionContext() {
  const ctx = await getSessionContext();
  if (!ctx) throw err(401, "UNAUTHORIZED");
  if (!ctx.user) throw err(401, "UNAUTHORIZED");
  return ctx;
}
export async function requireUser() {
  const { user } = await requireSessionContext();
  return user;
}
/**
 * ✅ (호환/기존 유지) memberships까지 포함한 user가 필요한 경우에만 사용
 */
export async function getCurrentUserWithTeam() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      memberships: {
        include: { team: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user || user.memberships.length === 0) return null;

  let team = session.team ?? null;
  if (!team) {
    team = user.memberships[0].team ?? null;

    // 세션에 currentTeamId가 없으면 보정(최초 1회성)
    if (team && !session.currentTeamId) {
      try {
        await prisma.session.update({
          where: { id: session.id },
          data: { currentTeamId: team.id },
        });
      } catch {
        // ignore
      }
    }
  }

  if (!team) return null;
  return { user, team };
}

export async function requireCurrentUserWithTeam() {
  const ctx = await getCurrentUserWithTeam();
  if (!ctx) throw err(401, "UNAUTHORIZED");
  return ctx;
}

/**
 * ✅ (권장) 팀 컨텍스트: 가능한 한 "세션(user/team)" 기반으로 처리
 */
export async function requireTeamContext() {
  const { session, user, team: sessionTeam } = await requireSessionContext();

  // 1) 팀 결정: 세션 currentTeamId relation이 우선
  let team = sessionTeam;

  // 2) 세션에 팀이 없으면 "기본 팀"을 teamMember에서 1번만 찾아서 세션 보정
  let role: TeamRole | null = null;

  if (!team) {
    const membership = await prisma.teamMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        team: true,
      },
    });

    if (!membership) throw err(403, "FORBIDDEN");
    team = membership.team;
    role = membership.role;

    // ✅ 세션 보정: 다음부터 session.team으로 바로 해결되게
    if (team && !session.currentTeamId) {
      try {
        await prisma.session.update({
          where: { id: session.id },
          data: { currentTeamId: team.id },
        });
      } catch {
        // ignore
      }
    }
  }

  // 3) role이 아직 없으면(= 세션팀이 있었던 경우) teamMember에서 role 조회
  if (!role) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      select: { role: true },
    });
    if (!member) throw err(403, "FORBIDDEN");
    role = member.role;
  }

  return { user, team, role };
}

/**
 * ✅ 팀 컨텍스트 확장 버전
 * - teamId가 들어오면 그 팀으로 "전환 시도" (반드시 멤버십 검증)
 * - teamId가 없으면 기존 세션 currentTeamId 기반 처리
 * - 성공 시 세션 currentTeamId도 보정(기본 true)
 */
export async function requireTeamContextFlexible(opts?: {
  teamId?: string | null;
  persistToSession?: boolean; // default true
}) {
  const { session, user } = await requireSessionContext();

  const requestedTeamId = (opts?.teamId ?? "").trim() || null;
  const persist = opts?.persistToSession !== false;

  // 1) teamId가 명시된 경우: 해당 팀 멤버십 검증 후 컨텍스트 반환
  if (requestedTeamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: requestedTeamId, userId: user.id } },
      select: { role: true, team: true },
    });

    if (!membership) throw err(403, "FORBIDDEN");

    // ✅ 세션 보정(다음부터 이 팀이 기본)
    if (persist && session.currentTeamId !== membership.team.id) {
      try {
        await prisma.session.update({
          where: { id: session.id },
          data: { currentTeamId: membership.team.id },
        });
      } catch {
        // ignore
      }
    }

    return { user, team: membership.team, role: membership.role };
  }

  // 2) teamId가 없으면 기존 requireTeamContext 로직 재사용
  return await requireTeamContext();
}

export function isAdmin(role: TeamRole | string) {
  return role === "OWNER" || role === "ADMIN";
}

// --------------------
// ✅ 관리자(슈퍼 어드민) - 이메일 기반
// --------------------
function configuredSuperAdminEmails() {
  return new Set(
    [process.env.SUPER_ADMIN_EMAILS, process.env.SUPER_ADMIN_EMAIL]
      .filter(Boolean)
      .flatMap((value) => value!.split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperAdminEmail(email?: string | null) {
  return !!email && configuredSuperAdminEmails().has(email.trim().toLowerCase());
}

export async function requireAdmin() {
  const { user } = await requireSessionContext();
  if (isSuperAdminEmail(user.email)) {
    await trackOpsEvent({
      event: "security.admin_access_granted",
      userId: user.id,
      properties: { email: user.email },
    });
    return { user };
  }
  await trackOpsEvent({
    event: "security.admin_access_denied",
    userId: user.id,
    properties: { email: user.email },
  });
  throw err(403, "FORBIDDEN");
}
