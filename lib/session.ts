// lib/session.ts
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { cache } from "react";

const SESSION_TTL_DAYS = 14;
export const SESSION_COOKIE_NAME = "sid";

export async function createSession(userId: string, currentTeamId?: string) {
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  const id = randomUUID();

  await prisma.session.create({
    data: { id, userId, currentTeamId, expiresAt },
  });

  return { id, expiresAt };
}

export async function deleteSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/**
 * ✅ 내부: 실제 DB 조회 함수(uncached)
 */
async function _getSessionUncached() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sid) return null;

  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true, team: true }, // team = currentTeamId relation
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) return null;

  return session;
}

/**
 * ✅ 요청 단위 캐시:
 * 같은 요청(같은 route handler 호출 흐름)에서 getSession()을 여러 번 호출해도 DB 1번만 감.
 */
export const getSession = cache(_getSessionUncached);

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
