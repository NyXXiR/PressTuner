import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  formatAiQuotaSummary,
  BILLING_PLANS,
} from "@/config/billing/plans";
import {
  consumeAiQuota,
  getAiPanelPolicyForPlan,
  getAiQuotaAdminConfig,
  getAiQuotaStateForSurface,
  getAiQuotaActionDefinition,
  updateAiQuotaAdminConfig,
} from "@/domain/quota/aiQuota";
import { prisma } from "@/lib/prisma";

test("catalog panel policies preserve the existing per-plan windows and limits", () => {
  const expected = {
    free_v1: [10, 80],
    basic_monthly_v1: [25, 250],
    pro_monthly_v1: [50, 800],
    enterprise_monthly_v1: [100, 2000],
  } as const;

  for (const [planId, [burstLimit, dailyLimit]] of Object.entries(expected)) {
    const policy = getAiPanelPolicyForPlan(BILLING_PLANS[planId]);
    assert.deepEqual(policy, {
      burstDurationMs: 10 * 60 * 1000,
      burstLimit,
      dailyDurationMs: 24 * 60 * 60 * 1000,
      dailyLimit,
    });
  }
});

test("AI quota action weights reflect request cost tiers", () => {
  assert.equal(getAiQuotaActionDefinition("press_panel_chat").units, 1);
  assert.equal(getAiQuotaActionDefinition("press_brief_normalize").units, 2);
  assert.equal(getAiQuotaActionDefinition("press_review").units, 3);
  assert.equal(getAiQuotaActionDefinition("press_rewrite").units, 4);
  assert.equal(getAiQuotaActionDefinition("press_draft_generate").units, 5);

  assert.equal(getAiQuotaActionDefinition("resume_chat").units, 1);
  assert.equal(getAiQuotaActionDefinition("resume_polish").units, 2);
  assert.equal(getAiQuotaActionDefinition("resume_strategy").units, 3);
  assert.equal(getAiQuotaActionDefinition("resume_generate").units, 4);
  assert.equal(getAiQuotaActionDefinition("resume_parse").units, 5);
});

test("Free Press AI usage is unlimited while action costs remain observable", () => {
  const free = BILLING_PLANS.free_v1;
  const windows = free.aiQuota.PRESS.windows;
  assert.equal(free.aiQuota.PRESS.unlimited, true);
  assert.equal(windows.find((window) => window.key === "5h")?.limitUnits, 16);
  assert.equal(windows.find((window) => window.key === "1w")?.limitUnits, 40);
  const journeyUnits = [
    "press_brief_normalize",
    "press_draft_generate",
    "press_review",
    "press_rewrite",
  ].reduce(
    (sum, action) =>
      sum + getAiQuotaActionDefinition(action as Parameters<typeof getAiQuotaActionDefinition>[0]).units,
    0,
  );
  assert.equal(journeyUnits, 14);
  assert.equal(formatAiQuotaSummary(free, "PRESS"), "AI 사용량 무제한");
});

test("pricing quota summaries use rolling windows", () => {
  const plan = BILLING_PLANS.career_pro_v1;

  assert.equal(
    formatAiQuotaSummary(plan, "RESUME"),
    "AI 사용량 180유닛/5시간 · 1,200유닛/7일",
  );
  assert.equal(
    formatAiQuotaSummary(plan, "PRESS"),
    "AI 사용량 10유닛/5시간 · 25유닛/7일",
  );
});

test("Free Press quota records concurrent usage without rejecting requests", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `quota-test-${suffix}`,
      label: `Quota Test ${suffix.slice(0, 8)}`,
      email: `quota-test-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `quota-test-${suffix}`,
      name: `Quota Test ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });

  try {
    const results = await Promise.allSettled([
      consumeAiQuota({
        teamId: team.id,
        userId: user.id,
        action: "press_panel_chat",
        units: 100,
      }),
      consumeAiQuota({
        teamId: team.id,
        userId: user.id,
        action: "press_panel_chat",
        units: 100,
      }),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(results.filter((result) => result.status === "rejected").length, 0);

    const usageCount = await prisma.usageLog.count({
      where: { teamId: team.id, model: "quota:PRESS:press_panel_chat" },
    });
    assert.equal(usageCount, 2);
  } finally {
    await prisma.usageLog.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("the pinned QA admin team bypasses rolling Press and Resume limits while usage stays observable", async () => {
  const STRONG_SECRET = `qa_${"test-only-".repeat(4)}fixture`;
  const suffix = randomUUID();
  const qaLoginId = `quota-qa-${suffix}`;
  const qaTeamSlug = `quota-qa-team-${suffix}`;
  const ordinaryTeamSlug = `quota-ordinary-team-${suffix}`;
  const envKeys = [
    "AI_QA_AUTH_ENABLED",
    "AI_QA_AUTH_SECRET",
    "AI_QA_AUTH_LOGIN_ID",
    "AI_QA_AUTH_TEAM_SLUG",
    "AI_QA_AUTH_ALLOWED_HOSTS",
  ] as const;
  const previousEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof envKeys)[number], string | undefined>;

  const user = await prisma.user.create({
    data: {
      loginId: qaLoginId,
      label: "Quota QA",
      email: `${qaLoginId}@example.com`,
    },
  });
  const qaTeam = await prisma.team.create({
    data: {
      slug: qaTeamSlug,
      name: "Quota QA Team",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const ordinaryTeam = await prisma.team.create({
    data: {
      slug: ordinaryTeamSlug,
      name: "Ordinary Limited Team",
    },
  });
  await prisma.teamProductSubscription.createMany({
    data: [qaTeam.id, ordinaryTeam.id].map((teamId) => ({
      teamId,
      product: "CAREER",
      planId: "career_pro_v1",
      plan: "PRO",
      membershipStatus: "ACTIVE",
    })),
  });

  Object.assign(process.env, {
    AI_QA_AUTH_ENABLED: "true",
    AI_QA_AUTH_SECRET: STRONG_SECRET,
    AI_QA_AUTH_LOGIN_ID: qaLoginId,
    AI_QA_AUTH_TEAM_SLUG: qaTeamSlug,
    AI_QA_AUTH_ALLOWED_HOSTS: "qa.example.com",
  });

  try {
    const ordinaryState = await getAiQuotaStateForSurface({
      teamId: ordinaryTeam.id,
      surface: "RESUME",
      requestedUnits: 500,
    });
    assert.equal(ordinaryState.unlimited, false);
    assert.equal(ordinaryState.status, "limited");

    const qaState = await consumeAiQuota({
      teamId: qaTeam.id,
      userId: user.id,
      action: "resume_chat",
      units: 500,
    });
    assert.equal(qaState.unlimited, true);
    assert.equal(qaState.status, "available");
    assert.equal(
      await prisma.usageLog.count({
        where: {
          teamId: qaTeam.id,
          model: "quota:RESUME:resume_chat",
          cost: 500,
        },
      }),
      1,
    );
  } finally {
    for (const key of envKeys) {
      if (typeof previousEnv[key] === "undefined") delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    await prisma.usageLog.deleteMany({
      where: { teamId: { in: [qaTeam.id, ordinaryTeam.id] } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: [qaTeam.id, ordinaryTeam.id] } },
    });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("AI quota admin window overrides affect runtime limits", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: {
      slug: `quota-override-${suffix}`,
      name: `Quota Override ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });

  try {
    await updateAiQuotaAdminConfig({
      windows: [
        {
          planId: "free_v1",
          surface: "PRESS",
          windowKey: "5h",
          limitUnits: 3,
        },
      ],
    });

    const state = await getAiQuotaStateForSurface({
      teamId: team.id,
      surface: "PRESS",
      requestedUnits: 4,
    });

    assert.equal(state.status, "limited");
    assert.equal(
      state.windows.find((window) => window.key === "5h")?.limitUnits,
      3,
    );

    const config = await getAiQuotaAdminConfig();
    const row = config.windows.find(
      (item) =>
        item.planId === "free_v1" &&
        item.surface === "PRESS" &&
        item.windowKey === "5h",
    );
    assert.equal(row?.overrideLimitUnits, 3);
  } finally {
    await updateAiQuotaAdminConfig({
      windows: [
        {
          planId: "free_v1",
          surface: "PRESS",
          windowKey: "5h",
          limitUnits: null,
        },
      ],
    });
    await prisma.team.deleteMany({ where: { id: team.id } });
  }
});

test("AI quota admin action overrides change default consume units", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `quota-action-${suffix}`,
      label: `Quota Action ${suffix.slice(0, 8)}`,
      email: `quota-action-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `quota-action-${suffix}`,
      name: `Quota Action ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });

  try {
    await updateAiQuotaAdminConfig({
      actions: [{ action: "press_panel_chat", units: 4 }],
    });

    await consumeAiQuota({
      teamId: team.id,
      userId: user.id,
      action: "press_panel_chat",
    });

    const usage = await prisma.usageLog.findFirstOrThrow({
      where: { teamId: team.id, model: "quota:PRESS:press_panel_chat" },
      select: { cost: true },
    });
    assert.equal(usage.cost, 4);
  } finally {
    await updateAiQuotaAdminConfig({
      actions: [{ action: "press_panel_chat", units: null }],
    });
    await prisma.usageLog.deleteMany({ where: { teamId: team.id } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
