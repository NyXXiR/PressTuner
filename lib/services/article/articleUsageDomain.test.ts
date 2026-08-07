import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { ArticleUsageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildArticleUsageSummary,
  consumeArticleUsageOrThrow,
  resolveArticleLimits,
  resolvePressRewriteLimit,
} from "./articleUsageDomain";

test("article quota is derived from the Press subscription plan catalog", () => {
  const subscription = {
    id: "team-1",
    planId: "pro_monthly_v1",
    plan: "PRO" as const,
    membershipStatus: "ACTIVE" as const,
    planExpiresAt: new Date(Date.now() + 60_000),
  };
  const limits = resolveArticleLimits(subscription);

  assert.ok(limits.briefLimit > 0);
  assert.ok(limits.polishLimit > 0);
  assert.ok(limits.quotaLimit > 0);
});

test("active Free Press subscriptions expose unlimited article operations", () => {
  const limits = resolveArticleLimits({
    id: "team-free",
    planId: "free_v1",
    plan: "FREE",
    membershipStatus: "ACTIVE",
    planExpiresAt: null,
  });

  assert.equal(limits.unlimited, true);
  assert.equal(
    resolvePressRewriteLimit(
      {
        id: "team-free",
        planId: "free_v1",
        plan: "FREE",
        membershipStatus: "ACTIVE",
        planExpiresAt: null,
      },
      5,
    ),
    null,
  );
});

test("legacy article counters do not reject central Press quota consumption", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { loginId: `free-unlimited-${suffix}`, label: "Free unlimited" },
  });
  const team = await prisma.team.create({
    data: {
      slug: `free-unlimited-${suffix}`,
      name: "Free unlimited",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  const article = await prisma.article.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "PRESS_RELEASE",
      status: "DRAFT",
      title: "Unlimited test",
    },
  });

  try {
    const subscription = {
      id: team.id,
      planId: "free_v1",
      plan: "FREE" as const,
      membershipStatus: "ACTIVE" as const,
      planExpiresAt: null,
    };
    await prisma.articleUsageStat.create({
      data: { articleId: article.id, briefUsed: 999, polishUsed: 999 },
    });

    for (let index = 0; index < 3; index += 1) {
      await prisma.$transaction((tx) =>
        consumeArticleUsageOrThrow(tx, {
          subscription,
          articleId: article.id,
          userId: user.id,
          type: ArticleUsageType.BRIEF,
        }),
      );
    }

    await prisma.$transaction((tx) =>
      consumeArticleUsageOrThrow(tx, {
        subscription,
        articleId: article.id,
        userId: user.id,
        type: ArticleUsageType.GENERATE,
      }),
    );

    assert.equal(
      (
        await prisma.articleUsageStat.findUniqueOrThrow({
          where: { articleId: article.id },
        })
      ).briefUsed,
      1002,
    );
    assert.equal(
      await prisma.usageLog.count({
        where: {
          teamId: team.id,
          model: "quota:PRESS:press_brief_normalize",
        },
      }),
      3,
    );
    assert.equal(
      await prisma.usageLog.count({
        where: {
          teamId: team.id,
          model: "quota:PRESS:press_draft_generate",
        },
      }),
      1,
    );
  } finally {
    await prisma.team.delete({ where: { id: team.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("inactive Press subscriptions expose zero article quota", () => {
  const subscription = {
    id: "team-1",
    planId: "pro_monthly_v1",
    plan: "PRO" as const,
    membershipStatus: "CANCELED" as const,
    planExpiresAt: null,
  };
  const limits = resolveArticleLimits(subscription);
  assert.deepEqual(
    {
      briefLimit: limits.briefLimit,
      polishLimit: limits.polishLimit,
      quotaLimit: limits.quotaLimit,
    },
    { briefLimit: 0, polishLimit: 0, quotaLimit: 0 },
  );
});

test("usage summary reports the selected Press subscription only", () => {
  const summary = buildArticleUsageSummary({
    subscription: {
      id: "team-1",
      planId: "pro_monthly_v1",
      plan: "PRO",
      membershipStatus: "ACTIVE",
      planExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    limits: { briefLimit: 4, polishLimit: 3, unlimited: false },
    stat: {
      briefUsed: 1,
      polishUsed: 2,
      lastBriefAt: null,
      lastPolishAt: null,
    },
  });

  assert.equal(summary.plan.effectivePlanId, "pro_monthly_v1");
  assert.equal(summary.article.briefRemaining, 3);
  assert.equal(summary.article.polishRemaining, 1);
});
