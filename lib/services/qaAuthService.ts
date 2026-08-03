import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

const QA_TICKET_PREFIX = "qa_ticket_";
const DEFAULT_NEXT_PATH = "/press/knowledge";
const DEFAULT_TICKET_TTL_SECONDS = 300;
const DEFAULT_SESSION_TTL_SECONDS = 4 * 60 * 60;

export type QaAuthConfig = {
  secret: string;
  loginId: string;
  teamSlug: string;
  allowedHosts: string[];
  ticketTtlSeconds: number;
  sessionTtlSeconds: number;
};

type QaAuthEnv = Record<string, string | undefined>;

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value === "undefined" || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function normalizeHost(value: string) {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    !candidate ||
    candidate.includes("/") ||
    candidate.includes("\\") ||
    candidate.includes("@") ||
    /\s/.test(candidate)
  ) {
    return null;
  }

  try {
    const url = new URL(`http://${candidate}`);
    return url.host.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function hasStrongQaSecret(secret: string) {
  if (secret.length < 32 || /\s/.test(secret)) return false;
  return new Set(secret).size >= 12;
}

export function readQaAuthConfig(
  env: QaAuthEnv = process.env,
): QaAuthConfig | null {
  if (env.AI_QA_AUTH_ENABLED !== "true") return null;

  const secret = env.AI_QA_AUTH_SECRET?.trim() ?? "";
  const loginId = env.AI_QA_AUTH_LOGIN_ID?.trim() ?? "";
  const teamSlug = env.AI_QA_AUTH_TEAM_SLUG?.trim() ?? "";
  const allowedHosts = (env.AI_QA_AUTH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(normalizeHost)
    .filter((host): host is string => Boolean(host));
  const ticketTtlSeconds = parseBoundedInteger(
    env.AI_QA_AUTH_TICKET_TTL_SECONDS,
    DEFAULT_TICKET_TTL_SECONDS,
    30,
    600,
  );
  const sessionTtlSeconds = parseBoundedInteger(
    env.AI_QA_AUTH_SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    300,
    8 * 60 * 60,
  );

  if (
    !hasStrongQaSecret(secret) ||
    !loginId ||
    !teamSlug ||
    allowedHosts.length === 0 ||
    ticketTtlSeconds === null ||
    sessionTtlSeconds === null
  ) {
    return null;
  }

  return {
    secret,
    loginId,
    teamSlug,
    allowedHosts: [...new Set(allowedHosts)],
    ticketTtlSeconds,
    sessionTtlSeconds,
  };
}

export function isQaAuthSecretValid(
  config: QaAuthConfig,
  candidate: string | null | undefined,
) {
  const expectedDigest = createHash("sha256").update(config.secret).digest();
  const candidateDigest = createHash("sha256")
    .update(candidate ?? "")
    .digest();
  return timingSafeEqual(expectedDigest, candidateDigest);
}

export function isQaAuthHostAllowed(
  config: QaAuthConfig,
  host: string | null | undefined,
) {
  if (!host) return false;
  const normalized = normalizeHost(host);
  return normalized !== null && config.allowedHosts.includes(normalized);
}

export function sanitizeQaAuthNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_NEXT_PATH;
  }
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_NEXT_PATH;
  }

  try {
    const parsed = new URL(value, "https://qa.invalid");
    if (parsed.origin !== "https://qa.invalid") return DEFAULT_NEXT_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}

function qaTicketId(token: string) {
  const digest = createHash("sha256").update(token).digest("hex");
  return `${QA_TICKET_PREFIX}${digest}`;
}

function assertAllowedHost(config: QaAuthConfig, host: string) {
  if (!isQaAuthHostAllowed(config, host)) {
    throw serviceError(404, "QA_AUTH_NOT_FOUND", "Not found.");
  }
}

async function resolvePinnedQaTarget(
  config: QaAuthConfig,
  options: { requireAdmin: boolean },
) {
  const user = await prisma.user.findUnique({
    where: { loginId: config.loginId },
    select: {
      id: true,
      isActive: true,
      deleteScheduledAt: true,
      memberships: {
        where: { team: { slug: config.teamSlug } },
        select: {
          role: true,
          team: {
            select: {
              id: true,
              membershipStatus: true,
            },
          },
        },
        take: 1,
      },
    },
  });
  const membership = user?.memberships[0];
  const team = membership?.team;
  if (
    !user ||
    !user.isActive ||
    user.deleteScheduledAt ||
    !team ||
    team.membershipStatus !== "ACTIVE" ||
    (options.requireAdmin &&
      membership.role !== "OWNER" &&
      membership.role !== "ADMIN")
  ) {
    throw serviceError(
      404,
      "QA_AUTH_TARGET_NOT_FOUND",
      "QA authentication target is unavailable.",
    );
  }
  return { userId: user.id, teamId: team.id };
}

async function createPinnedQaSession(input: {
  userId: string;
  teamId: string;
  sessionTtlSeconds: number;
}) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + input.sessionTtlSeconds * 1000,
  );
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        currentTeamId: input.teamId,
        expiresAt,
      },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { lastLoginAt: now },
    });
    return {
      session: { id: session.id, expiresAt: session.expiresAt },
      userId: input.userId,
      teamId: input.teamId,
    };
  });
}

export async function bootstrapQaPlaygroundSession(input: {
  config: QaAuthConfig;
  host: string;
}) {
  assertAllowedHost(input.config, input.host);
  const target = await resolvePinnedQaTarget(input.config, {
    requireAdmin: true,
  });
  return createPinnedQaSession({
    ...target,
    sessionTtlSeconds: input.config.sessionTtlSeconds,
  });
}

export async function issueQaLoginTicket(input: {
  config: QaAuthConfig;
  host: string;
}) {
  assertAllowedHost(input.config, input.host);

  const target = await resolvePinnedQaTarget(input.config, {
    requireAdmin: false,
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + input.config.ticketTtlSeconds * 1000,
  );
  await prisma.$transaction([
    prisma.session.deleteMany({
      where: {
        id: { startsWith: QA_TICKET_PREFIX },
        expiresAt: { lte: new Date() },
      },
    }),
    prisma.session.create({
      data: {
        id: qaTicketId(token),
        userId: target.userId,
        currentTeamId: target.teamId,
        expiresAt,
      },
    }),
  ]);

  return {
    token,
    expiresAt,
    userId: target.userId,
    teamId: target.teamId,
  };
}

export async function redeemQaLoginTicket(input: {
  config: QaAuthConfig;
  host: string;
  token: string;
}) {
  assertAllowedHost(input.config, input.host);
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
    throw serviceError(
      404,
      "QA_AUTH_LINK_INVALID",
      "This QA login link is invalid or expired.",
    );
  }

  const ticketId = qaTicketId(input.token);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.session.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            loginId: true,
            isActive: true,
            deleteScheduledAt: true,
          },
        },
        team: {
          select: {
            slug: true,
            membershipStatus: true,
          },
        },
      },
    });
    if (
      !ticket ||
      ticket.expiresAt <= now ||
      ticket.user.loginId !== input.config.loginId ||
      !ticket.user.isActive ||
      ticket.user.deleteScheduledAt ||
      !ticket.currentTeamId ||
      ticket.team?.slug !== input.config.teamSlug ||
      ticket.team.membershipStatus !== "ACTIVE"
    ) {
      throw serviceError(
        404,
        "QA_AUTH_LINK_INVALID",
        "This QA login link is invalid or expired.",
      );
    }

    const membership = await tx.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: ticket.currentTeamId,
          userId: ticket.userId,
        },
      },
      select: { userId: true },
    });
    if (!membership) {
      throw serviceError(
        404,
        "QA_AUTH_LINK_INVALID",
        "This QA login link is invalid or expired.",
      );
    }

    const consumed = await tx.session.deleteMany({
      where: {
        id: ticketId,
        expiresAt: { gt: now },
      },
    });
    if (consumed.count !== 1) {
      throw serviceError(
        404,
        "QA_AUTH_LINK_INVALID",
        "This QA login link is invalid or expired.",
      );
    }

    const expiresAt = new Date(
      now.getTime() + input.config.sessionTtlSeconds * 1000,
    );
    const session = await tx.session.create({
      data: {
        id: randomUUID(),
        userId: ticket.userId,
        currentTeamId: ticket.currentTeamId,
        expiresAt,
      },
    });
    await tx.user.update({
      where: { id: ticket.userId },
      data: { lastLoginAt: now },
    });

    return {
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
      userId: ticket.userId,
      teamId: ticket.currentTeamId,
    };
  });
}
