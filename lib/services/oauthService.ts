import { AuthProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { trackOpsEvent } from "@/lib/ops";
import { serviceError } from "@/lib/services/serviceError";

async function ensureDefaultTeam(userId: string) {
  const existing = await prisma.teamMember.findFirst({
    where: { userId },
    select: { teamId: true },
  });
  if (existing?.teamId) return existing.teamId;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const team = await prisma.team.create({
    data: {
      slug: `team-${userId.slice(0, 6)}`,
      name: user?.label ? `${user.label}의 팀` : "내 팀",
      members: { create: { userId, role: "OWNER" } },
      productSubscriptions: {
        create: [
          { product: "PRESS", planId: "free_v1", plan: "FREE" },
          { product: "CAREER", planId: "free_v1", plan: "FREE" },
        ],
      },
      limitArticleMonthly: 3,
      limitResumeMonthly: 10,
    },
  });
  return team.id;
}

export async function issueSessionForUser(userId: string) {
  const currentTeamId = await ensureDefaultTeam(userId);
  const session = await createSession(userId, currentTeamId);
  return { session, currentTeamId };
}

export async function registerWithGoogle(input: {
  provider: AuthProvider;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  emailVerified?: boolean;
}) {
  const provider = input.provider;
  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: input.providerAccountId,
      },
    },
    select: { userId: true },
  });

  if (existingOAuth) {
    await prisma.user.update({
      where: { id: existingOAuth.userId },
      data: { lastLoginAt: new Date() },
    });
    const { session } = await issueSessionForUser(existingOAuth.userId);
    return { session, userId: existingOAuth.userId };
  }

  const existingUser = input.email
    ? await prisma.user.findUnique({ where: { email: input.email } })
    : null;

  if (existingUser) {
    if (input.emailVerified !== true) {
      await trackOpsEvent({
        event: "security.oauth_unverified_email_conflict",
        userId: existingUser.id,
        properties: { provider, providerAccountId: input.providerAccountId },
      });
      throw serviceError(
        409,
        "OAUTH_EMAIL_VERIFICATION_REQUIRED",
        "Verified provider email is required to link an existing account.",
      );
    }
    const existingProvider = await prisma.oAuthAccount.findUnique({
      where: { provider_userId: { provider, userId: existingUser.id } },
    });

    if (existingProvider) {
      if (existingProvider.providerAccountId !== input.providerAccountId) {
        await trackOpsEvent({
          event: "security.oauth_account_conflict",
          userId: existingUser.id,
          properties: { provider, providerAccountId: input.providerAccountId },
        });
        throw serviceError(
          409,
          "OAUTH_ACCOUNT_MISMATCH",
          "이미 연결된 OAuth 계정이 있습니다."
        );
      }
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { lastLoginAt: new Date() },
      });
      const { session } = await issueSessionForUser(existingUser.id);
      return { session, userId: existingUser.id };
    }

    await prisma.oAuthAccount.create({
      data: {
        provider,
        providerAccountId: input.providerAccountId,
        userId: existingUser.id,
        email: input.email ?? null,
        profileJson: { name: input.name, picture: input.picture },
      },
    });
    await trackOpsEvent({
      event: "security.oauth_account_linked",
      userId: existingUser.id,
      properties: { provider, providerAccountId: input.providerAccountId, mode: "verified_email" },
    });

    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        lastLoginAt: new Date(),
        avatarUrl: existingUser.avatarUrl ?? input.picture ?? null,
        label: existingUser.label || input.name || "사용자",
      },
    });

    const { session } = await issueSessionForUser(existingUser.id);
    return { session, userId: existingUser.id };
  }

  const user = await prisma.user.create({
    data: {
      loginId: input.email ?? `google:${input.providerAccountId}`,
      label: input.name || "사용자",
      email: input.email ?? null,
      avatarUrl: input.picture ?? null,
      lastLoginAt: new Date(),
    },
  });

  await prisma.oAuthAccount.create({
    data: {
      provider,
      providerAccountId: input.providerAccountId,
      userId: user.id,
      email: input.email ?? null,
      profileJson: { name: input.name, picture: input.picture },
    },
  });

  const { session } = await issueSessionForUser(user.id);
  return { session, userId: user.id };
}

export async function linkGoogleAccountToUser(input: {
  userId: string;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  emailVerified?: boolean;
}) {
  const provider = AuthProvider.GOOGLE;
  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: input.providerAccountId } },
  });

  if (existingOAuth && existingOAuth.userId !== input.userId) {
    await trackOpsEvent({
      event: "security.oauth_account_conflict",
      userId: input.userId,
      properties: { provider, providerAccountId: input.providerAccountId },
    });
    throw serviceError(409, "OAUTH_ALREADY_LINKED", "이미 연결된 OAuth 계정이 있습니다.");
  }

  await prisma.oAuthAccount.upsert({
    where: { provider_providerAccountId: { provider, providerAccountId: input.providerAccountId } },
    create: {
      provider,
      providerAccountId: input.providerAccountId,
      userId: input.userId,
      email: input.email ?? null,
      profileJson: {
        name: input.name,
        picture: input.picture,
        email_verified: input.emailVerified,
      },
    },
    update: {
      userId: input.userId,
      email: input.email ?? null,
      profileJson: {
        name: input.name,
        picture: input.picture,
        email_verified: input.emailVerified,
      },
    },
  });
  await trackOpsEvent({
    event: "security.oauth_account_linked",
    userId: input.userId,
    properties: {
      provider,
      providerAccountId: input.providerAccountId,
      mode: "manual",
      emailVerified: input.emailVerified === true,
    },
  });
}

export async function resolveGoogleLogin(input: {
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  emailVerified?: boolean;
}) {
  const provider = AuthProvider.GOOGLE;
  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: input.providerAccountId } },
  });

  if (existingOAuth) {
    return { userId: existingOAuth.userId };
  }

  const matchedUser = input.email
    ? await prisma.user.findUnique({ where: { email: input.email } })
    : null;

  if (matchedUser) {
    if (input.emailVerified !== true) {
      await trackOpsEvent({
        event: "security.oauth_unverified_email_conflict",
        userId: matchedUser.id,
        properties: { provider, providerAccountId: input.providerAccountId },
      });
      return {
        signupPayload: {
          provider,
          providerAccountId: input.providerAccountId,
          email: input.email,
          name: input.name,
          picture: input.picture,
          emailVerified: false,
        },
      };
    }
    await prisma.oAuthAccount.create({
      data: {
        provider,
        providerAccountId: input.providerAccountId,
        userId: matchedUser.id,
        email: input.email ?? null,
        profileJson: {
          name: input.name,
          picture: input.picture,
          email_verified: input.emailVerified,
        },
      },
    });
    await trackOpsEvent({
      event: "security.oauth_account_linked",
      userId: matchedUser.id,
      properties: { provider, providerAccountId: input.providerAccountId, mode: "verified_email" },
    });
    return { userId: matchedUser.id };
  }

  return {
    signupPayload: {
      provider,
      providerAccountId: input.providerAccountId,
      email: input.email,
      name: input.name,
      picture: input.picture,
      emailVerified: input.emailVerified === true,
    },
  };
}

export async function finalizeOAuthLogin(userId: string) {
  const currentTeamId = await ensureDefaultTeam(userId);
  const [session] = await Promise.all([
    createSession(userId, currentTeamId),
    prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return { session, currentTeamId };
}
