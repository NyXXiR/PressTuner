import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { getUsageSummaryForTeam } from "@/lib/services/usageService";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { serviceError } from "@/lib/services/serviceError";

export async function loginWithPassword(input: {
  loginId: string;
  password: string;
}) {
  const user = await prisma.user.findUnique({
    where: { loginId: input.loginId },
    include: {
      memberships: { include: { team: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!user || user.memberships.length === 0) {
    throw serviceError(401, "USER_NOT_FOUND", "존재하지 않는 계정입니다.");
  }

  const authResult = await verifyPassword(String(input.password), user.password ?? "");
  if (!authResult.ok) {
    throw serviceError(
      401,
      "INVALID_CREDENTIALS",
      "아이디 또는 비밀번호가 올바르지 않습니다."
    );
  }

  if (authResult.needsUpgrade) {
    const upgraded = await hashPassword(String(input.password));
    await prisma.user.update({
      where: { id: user.id },
      data: { password: upgraded },
    });
  }

  const activeTeam = user.memberships[0].team;

  const [usage, session] = await Promise.all([
    getUsageSummaryForTeam(activeTeam.id),
    createSession(user.id, activeTeam.id),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return {
    user,
    team: activeTeam,
    usage,
    session,
  };
}
