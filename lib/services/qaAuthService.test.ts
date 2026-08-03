import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  bootstrapQaPlaygroundSession,
  isQaAuthHostAllowed,
  isQaAuthSecretValid,
  issueQaLoginTicket,
  readQaAuthConfig,
  redeemQaLoginTicket,
  sanitizeQaAuthNextPath,
  type QaAuthConfig,
} from "@/lib/services/qaAuthService";

const STRONG_SECRET = `qa_${"test-only-".repeat(4)}fixture`;

test("QA auth stays disabled until every server-only control is configured", () => {
  assert.equal(readQaAuthConfig({}), null);
  assert.equal(
    readQaAuthConfig({
      AI_QA_AUTH_ENABLED: "true",
      AI_QA_AUTH_SECRET: "too-short",
      AI_QA_AUTH_LOGIN_ID: "browser-qa",
      AI_QA_AUTH_TEAM_SLUG: "browser-qa-team",
      AI_QA_AUTH_ALLOWED_HOSTS: "qa.example.com",
    }),
    null,
  );

  const config = readQaAuthConfig({
    AI_QA_AUTH_ENABLED: "true",
    AI_QA_AUTH_SECRET: STRONG_SECRET,
    AI_QA_AUTH_LOGIN_ID: "browser-qa",
    AI_QA_AUTH_TEAM_SLUG: "browser-qa-team",
    AI_QA_AUTH_ALLOWED_HOSTS: "QA.EXAMPLE.COM, localhost:3003",
    AI_QA_AUTH_TICKET_TTL_SECONDS: "90",
    AI_QA_AUTH_SESSION_TTL_SECONDS: "3600",
  });

  assert.ok(config);
  assert.deepEqual(config.allowedHosts, ["qa.example.com", "localhost:3003"]);
  assert.equal(config.ticketTtlSeconds, 90);
  assert.equal(config.sessionTtlSeconds, 3600);
});

test("QA auth validates the issuer secret, host, and local redirect", () => {
  const config = readQaAuthConfig({
    AI_QA_AUTH_ENABLED: "true",
    AI_QA_AUTH_SECRET: STRONG_SECRET,
    AI_QA_AUTH_LOGIN_ID: "browser-qa",
    AI_QA_AUTH_TEAM_SLUG: "browser-qa-team",
    AI_QA_AUTH_ALLOWED_HOSTS: "qa.example.com,localhost:3003",
  });
  assert.ok(config);

  assert.equal(isQaAuthSecretValid(config, STRONG_SECRET), true);
  assert.equal(isQaAuthSecretValid(config, `${STRONG_SECRET}x`), false);
  assert.equal(isQaAuthHostAllowed(config, "QA.EXAMPLE.COM"), true);
  assert.equal(isQaAuthHostAllowed(config, "qa.example.com.attacker.test"), false);
  assert.equal(sanitizeQaAuthNextPath("/press/knowledge?qa=1"), "/press/knowledge?qa=1");
  assert.equal(sanitizeQaAuthNextPath("https://attacker.test"), "/press/knowledge");
  assert.equal(sanitizeQaAuthNextPath("//attacker.test/path"), "/press/knowledge");
  assert.equal(sanitizeQaAuthNextPath("/\\attacker.test"), "/press/knowledge");
});

test("a QA ticket is hashed at rest, bound to the pinned team, and redeemable once", async () => {
  const suffix = randomUUID();
  const loginId = `browser-qa-${suffix}`;
  const teamSlug = `browser-qa-team-${suffix}`;
  const user = await prisma.user.create({
    data: {
      loginId,
      label: "Browser QA",
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: teamSlug,
      name: "Browser QA Team",
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
  });
  const config: QaAuthConfig = {
    secret: STRONG_SECRET,
    loginId,
    teamSlug,
    allowedHosts: ["qa.example.com"],
    ticketTtlSeconds: 120,
    sessionTtlSeconds: 1800,
  };

  try {
    const ticket = await issueQaLoginTicket({
      config,
      host: "qa.example.com",
    });
    assert.equal(ticket.userId, user.id);
    assert.equal(ticket.teamId, team.id);
    assert.equal(ticket.token.length >= 40, true);

    const storedTicket = await prisma.session.findFirstOrThrow({
      where: {
        userId: user.id,
        id: { startsWith: "qa_ticket_" },
      },
    });
    assert.equal(storedTicket.id.includes(ticket.token), false);
    assert.equal(storedTicket.currentTeamId, team.id);

    const redeemed = await redeemQaLoginTicket({
      config,
      host: "qa.example.com",
      token: ticket.token,
    });
    assert.equal(redeemed.userId, user.id);
    assert.equal(redeemed.teamId, team.id);
    assert.notEqual(redeemed.session.id, storedTicket.id);
    assert.equal(
      await prisma.session.count({ where: { id: storedTicket.id } }),
      0,
    );

    await assert.rejects(
      () =>
        redeemQaLoginTicket({
          config,
          host: "qa.example.com",
          token: ticket.token,
        }),
      (error: any) => error?.code === "QA_AUTH_LINK_INVALID",
    );
  } finally {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("playground bootstrap creates a normal session only for the pinned active admin", async () => {
  const suffix = randomUUID();
  const loginId = `browser-auto-${suffix}`;
  const teamSlug = `browser-auto-team-${suffix}`;
  const user = await prisma.user.create({
    data: { loginId, label: "Browser Auto" },
  });
  const team = await prisma.team.create({
    data: {
      slug: teamSlug,
      name: "Browser Auto Team",
      members: { create: { userId: user.id, role: "ADMIN" } },
    },
  });
  const config: QaAuthConfig = {
    secret: STRONG_SECRET,
    loginId,
    teamSlug,
    allowedHosts: ["qa.example.com"],
    ticketTtlSeconds: 120,
    sessionTtlSeconds: 900,
  };

  try {
    const bootstrapped = await bootstrapQaPlaygroundSession({
      config,
      host: "qa.example.com",
    });
    assert.equal(bootstrapped.userId, user.id);
    assert.equal(bootstrapped.teamId, team.id);
    assert.doesNotMatch(bootstrapped.session.id, /^qa_ticket_/);
    const stored = await prisma.session.findUniqueOrThrow({
      where: { id: bootstrapped.session.id },
    });
    assert.equal(stored.currentTeamId, team.id);

    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      data: { role: "MEMBER" },
    });
    await assert.rejects(
      bootstrapQaPlaygroundSession({ config, host: "qa.example.com" }),
      (error: any) => error?.code === "QA_AUTH_TARGET_NOT_FOUND",
    );
    await assert.rejects(
      bootstrapQaPlaygroundSession({ config, host: "other.example.com" }),
      (error: any) => error?.code === "QA_AUTH_NOT_FOUND",
    );
    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      data: { role: "ADMIN" },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    await assert.rejects(
      bootstrapQaPlaygroundSession({ config, host: "qa.example.com" }),
      (error: any) => error?.code === "QA_AUTH_TARGET_NOT_FOUND",
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });
    await prisma.team.update({
      where: { id: team.id },
      data: { membershipStatus: "CANCELED" },
    });
    await assert.rejects(
      bootstrapQaPlaygroundSession({ config, host: "qa.example.com" }),
      (error: any) => error?.code === "QA_AUTH_TARGET_NOT_FOUND",
    );
  } finally {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
