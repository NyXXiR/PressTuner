import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  attachPaymentMethod,
  cancelSubscriptionCommand,
  scheduleDowngradeCommand,
  uncancelSubscriptionCommand,
} from "./commands";

async function createUserAndTeam(args?: { teamData?: Record<string, unknown> }) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `billing-command-${suffix}`,
      label: `Billing Command ${suffix.slice(0, 8)}`,
      email: `billing-command-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `billing-command-${suffix}`,
      name: `Billing Command ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
      ...args?.teamData,
    },
  });

  return { user, team };
}

async function cleanup(args: { teamId?: string; userId?: string }) {
  if (args.teamId) {
    await prisma.team.deleteMany({ where: { id: args.teamId } });
  }
  if (args.userId) {
    await prisma.user.deleteMany({ where: { id: args.userId } });
  }
}

test("cancelSubscriptionCommand rejects free teams", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    await assert.rejects(
      cancelSubscriptionCommand({
        teamId: team.id,
        userId: user.id,
        product: "CAREER",
      }),
      /NO_ACTIVE_PAID_SUBSCRIPTION/,
    );
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("attachPaymentMethod rejects expired paid teams", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      nextPaymentAmount: 5900,
    },
  });

  await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      planId: "career_basic_v1",
      plan: "BASIC",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "billing-key-existing",
      nextPaymentAmount: 9900,
      nextBillingAt: new Date(),
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  try {
    await assert.rejects(
      attachPaymentMethod({
        teamId: team.id,
        provider: "INICIS",
        product: "CAREER",
        billingKey: "billing-key-expired",
      }),
      /SUBSCRIPTION_EXPIRED/,
    );
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("attachPaymentMethod requires explicit product", async () => {
  const { user, team } = await createUserAndTeam();

  try {
    await assert.rejects(
      attachPaymentMethod({
        teamId: team.id,
        provider: "INICIS",
        billingKey: "billing-key-missing-product",
        product: undefined as unknown as "PRESS",
      } as unknown as Parameters<typeof attachPaymentMethod>[0]),
      /PRODUCT_REQUIRED/,
    );
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("uncancelSubscriptionCommand rejects canceled teams without a billing method", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_pro_v1",
      plan: "PRO",
      planCategory: "CAREER",
      membershipStatus: "CANCELED",
      payProvider: null,
      billingKey: null,
      planExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      cancelRequestedAt: new Date(),
      nextPaymentAmount: 12900,
    },
  });

  try {
    await assert.rejects(
      uncancelSubscriptionCommand({ teamId: team.id, product: "PRESS" }),
      /PAYMENT_METHOD_REQUIRED/,
    );
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("scheduleDowngradeCommand rejects cross-product plan transitions", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "basic_monthly_v1",
      plan: "BASIC",
      planCategory: "PRESS",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "billing-key-existing",
      planExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      nextPaymentAmount: 9900,
      limitArticleMonthly: 30,
      usageArticleMonthly: 5,
    },
  });

  try {
    await assert.rejects(
      scheduleDowngradeCommand({
        teamId: team.id,
        targetPlanId: "career_basic_v1",
      }),
      /NO_ACTIVE_SUBSCRIPTION/,
    );
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});
