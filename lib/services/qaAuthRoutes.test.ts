import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { NextRequest } from "next/server";

import { GET as autoQaLogin } from "@/app/api/auth/qa/auto/route";
import { POST as issueQaLogin } from "@/app/api/auth/qa/issue/route";
import { GET as redeemQaLogin } from "@/app/api/auth/qa/redeem/route";
import { prisma } from "@/lib/prisma";

const STRONG_SECRET = `qa_${"test-only-".repeat(4)}fixture`;

test("QA auth routes issue a no-store link and exchange it for an HTTP-only sid", async () => {
  const suffix = randomUUID();
  const loginId = `qa-route-${suffix}`;
  const teamSlug = `qa-route-team-${suffix}`;
  const user = await prisma.user.create({
    data: {
      loginId,
      label: "QA Route",
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: teamSlug,
      name: "QA Route Team",
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
    },
  });
  const previous = { ...process.env };

  try {
    Object.assign(process.env, {
      AI_QA_AUTH_ENABLED: "true",
      AI_QA_AUTH_SECRET: STRONG_SECRET,
      AI_QA_AUTH_LOGIN_ID: loginId,
      AI_QA_AUTH_TEAM_SLUG: teamSlug,
      AI_QA_AUTH_ALLOWED_HOSTS: "qa.example.com",
      AI_QA_AUTH_TICKET_TTL_SECONDS: "60",
      AI_QA_AUTH_SESSION_TTL_SECONDS: "900",
    });

    const issueResponse = await issueQaLogin(
      new NextRequest("https://qa.example.com/api/auth/qa/issue", {
        method: "POST",
        headers: {
          authorization: `Bearer ${STRONG_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ next: "/resume/bricks" }),
      }),
    );
    assert.equal(issueResponse.status, 201);
    assert.equal(issueResponse.headers.get("cache-control"), "no-store");
    assert.equal(issueResponse.headers.get("referrer-policy"), "no-referrer");

    const issued = await issueResponse.json();
    assert.match(issued.loginUrl, /^https:\/\/qa\.example\.com\/api\/auth\/qa\/redeem\?/);
    assert.equal(issued.loginUrl.includes(STRONG_SECRET), false);

    const redeemResponse = await redeemQaLogin(
      new NextRequest(issued.loginUrl),
    );
    assert.equal(redeemResponse.status, 307);
    assert.equal(redeemResponse.headers.get("location"), "https://qa.example.com/resume/bricks");
    assert.match(redeemResponse.headers.get("set-cookie") ?? "", /^sid=/);
    assert.match(redeemResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(redeemResponse.headers.get("set-cookie") ?? "", /Secure/i);

    const replayResponse = await redeemQaLogin(
      new NextRequest(issued.loginUrl),
    );
    assert.equal(replayResponse.status, 404);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("QA auth routes are indistinguishable from missing when disabled or unauthorized", async () => {
  const previousEnabled = process.env.AI_QA_AUTH_ENABLED;
  try {
    delete process.env.AI_QA_AUTH_ENABLED;
    const disabled = await issueQaLogin(
      new NextRequest("https://qa.example.com/api/auth/qa/issue", {
        method: "POST",
      }),
    );
    assert.equal(disabled.status, 404);
  } finally {
    if (typeof previousEnabled === "undefined") {
      delete process.env.AI_QA_AUTH_ENABLED;
    } else {
      process.env.AI_QA_AUTH_ENABLED = previousEnabled;
    }
  }
});

test("automatic QA bootstrap sets an ordinary secure sid and returns to the fixed playground", async () => {
  const suffix = randomUUID();
  const loginId = `qa-auto-route-${suffix}`;
  const teamSlug = `qa-auto-route-team-${suffix}`;
  const user = await prisma.user.create({
    data: { loginId, label: "QA Auto Route" },
  });
  const team = await prisma.team.create({
    data: {
      slug: teamSlug,
      name: "QA Auto Route Team",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const previous = { ...process.env };

  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      AI_QA_AUTH_ENABLED: "true",
      AI_QA_AUTH_SECRET: STRONG_SECRET,
      AI_QA_AUTH_LOGIN_ID: loginId,
      AI_QA_AUTH_TEAM_SLUG: teamSlug,
      AI_QA_AUTH_ALLOWED_HOSTS: "qa.example.com",
      AI_QA_AUTH_SESSION_TTL_SECONDS: "900",
    });
    const response = await autoQaLogin(
      new NextRequest(
        "https://qa.example.com/api/auth/qa/auto?next=https://attacker.test",
      ),
    );
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      "https://qa.example.com/dev/api-playground",
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^sid=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
    assert.match(cookie, /Expires=/i);
    assert.match(cookie, /Secure/i);
    assert.doesNotMatch(cookie, /qa_ticket_/);

    await prisma.teamMember.update({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      data: { role: "MEMBER" },
    });
    const nonAdmin = await autoQaLogin(
      new NextRequest("https://qa.example.com/api/auth/qa/auto"),
    );
    assert.equal(nonAdmin.status, 404);
    assert.equal(nonAdmin.headers.get("set-cookie"), null);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("automatic QA bootstrap is concealed in production and for invalid targets", async () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      ENABLE_DEV_API_PLAYGROUND: "true",
      AI_QA_AUTH_ENABLED: "true",
      AI_QA_AUTH_SECRET: STRONG_SECRET,
      AI_QA_AUTH_LOGIN_ID: "missing-user",
      AI_QA_AUTH_TEAM_SLUG: "missing-team",
      AI_QA_AUTH_ALLOWED_HOSTS: "qa.example.com",
    });
    const production = await autoQaLogin(
      new NextRequest("https://qa.example.com/api/auth/qa/auto"),
    );
    assert.equal(production.status, 404);
    assert.equal(production.headers.get("set-cookie"), null);

    Object.assign(process.env, { NODE_ENV: "test" });
    const missing = await autoQaLogin(
      new NextRequest("https://qa.example.com/api/auth/qa/auto"),
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("set-cookie"), null);
    const wrongHost = await autoQaLogin(
      new NextRequest("https://other.example.com/api/auth/qa/auto"),
    );
    assert.equal(wrongHost.status, 404);
    assert.equal(wrongHost.headers.get("set-cookie"), null);
    delete process.env.AI_QA_AUTH_ENABLED;
    const disabled = await autoQaLogin(
      new NextRequest("https://qa.example.com/api/auth/qa/auto"),
    );
    assert.equal(disabled.status, 404);
    assert.equal(disabled.headers.get("set-cookie"), null);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});
