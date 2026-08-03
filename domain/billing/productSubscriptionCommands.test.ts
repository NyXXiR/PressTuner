import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  cancelProductSubscription,
  scheduleProductPlanChange,
  uncancelProductSubscription,
  unscheduleProductPlanChange,
} from "./productSubscriptionCommands";
import {
  getMonthlyAmountByPlanId,
} from "@/config/billing/plans";

function futureDate(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

async function createUserAndTeam(args?: { teamData?: Record<string, unknown> }) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `billing-cmd-${suffix}`,
      label: `Billing Command ${suffix.slice(0, 8)}`,
      email: `billing-cmd-${suffix}@example.com`,
    },
  });

  const team = await prisma.team.create({
    data: {
      slug: `billing-cmd-${suffix}`,
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

async function createSubscription(args: {
  teamId: string;
  product: "PRESS" | "CAREER";
  planId: string;
  plan: "FREE" | "BASIC" | "PRO";
  membershipStatus?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  payProvider?: "INICIS" | "KAKAOPAY" | null;
  billingKey?: string | null;
  nextPaymentAmount?: number;
  planExpiresAt?: Date | null;
  nextBillingAt?: Date | null;
  pendingPlan?: "FREE" | "BASIC" | "PRO" | null;
  pendingPlanId?: string | null;
  pendingPlanStartsAt?: Date | null;
  cancelRequestedAt?: Date | null;
  lastPaymentId?: string | null;
  lastPaidAt?: Date | null;
}) {
  return prisma.teamProductSubscription.create({
    data: {
      teamId: args.teamId,
      product: args.product,
      planId: args.planId,
      plan: args.plan,
      membershipStatus: args.membershipStatus ?? "ACTIVE",
      payProvider: args.payProvider ?? null,
      billingKey: args.billingKey ?? null,
      nextPaymentAmount: args.nextPaymentAmount ?? 0,
      planExpiresAt: args.planExpiresAt ?? null,
      nextBillingAt: args.nextBillingAt ?? null,
      pendingPlan: args.pendingPlan ?? null,
      pendingPlanId: args.pendingPlanId ?? null,
      pendingPlanStartsAt: args.pendingPlanStartsAt ?? null,
      cancelRequestedAt: args.cancelRequestedAt ?? null,
      lastPaymentId: args.lastPaymentId ?? null,
      lastPaidAt: args.lastPaidAt ?? null,
    },
  });
}

test("scheduleProductPlanChange updates only requested product snapshot and keeps team row in-sync for that product", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "basic_monthly_v1",
      plan: "BASIC",
      planCategory: "PRESS",
      membershipStatus: "ACTIVE",
      planExpiresAt: futureDate(2),
      nextBillingAt: futureDate(1),
      nextPaymentAmount: 9900,
      payProvider: "INICIS",
      billingKey: "press-billing",
    },
  });
  const pressRow = await createSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-billing",
    nextPaymentAmount: 9900,
    planExpiresAt: futureDate(2),
    nextBillingAt: futureDate(1),
  });
  const careerPlanExpiresAt = futureDate(2);
  await createSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_pro_v1",
    plan: "PRO",
    payProvider: "INICIS",
    billingKey: "career-billing",
    nextPaymentAmount: 12900,
    planExpiresAt: careerPlanExpiresAt,
    nextBillingAt: futureDate(1),
  });

  try {
    const beforeHistory = await prisma.teamBillingHistory.count({
      where: { teamId: team.id, type: "CANCEL" },
    });

    const updated = await scheduleProductPlanChange({
      teamId: team.id,
      targetPlanId: "career_basic_v1",
    });

    const career = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    const press = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });
    const teamRow = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    const afterHistory = await prisma.teamBillingHistory.count({
      where: { teamId: team.id, type: "CANCEL", meta: { path: ["product"], equals: "CAREER" } as never },
    });

    assert.equal(updated.product, "CAREER");
    assert.equal(updated.plan, "PRO");
    assert.equal(updated.pendingPlan, "BASIC");
    assert.equal(updated.pendingPlanId, "career_basic_v1");
    assert.equal(updated.nextPaymentAmount, getMonthlyAmountByPlanId("career_basic_v1"));
    assert.equal(press.planId, pressRow.planId);
    assert.equal(press.plan, "BASIC");
    assert.equal(teamRow.planId, "career_pro_v1");
    assert.equal(teamRow.plan, "PRO");
    assert.equal(teamRow.membershipStatus, "ACTIVE");
    assert.equal(teamRow.nextPaymentAmount, getMonthlyAmountByPlanId("career_basic_v1"));
    assert.equal(afterHistory, beforeHistory + 1);
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("unscheduleProductPlanChange restores payment amount and does not touch untouched product row", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "basic_monthly_v1",
      plan: "BASIC",
      planCategory: "PRESS",
      membershipStatus: "ACTIVE",
      planExpiresAt: futureDate(2),
      nextBillingAt: futureDate(1),
      nextPaymentAmount: 9900,
      payProvider: "INICIS",
      billingKey: "press-billing",
    },
  });
  const pressRow = await createSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-billing",
    nextPaymentAmount: 9900,
    planExpiresAt: futureDate(2),
    nextBillingAt: futureDate(1),
  });
  const careerExpiresAt = futureDate(2);
  await createSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_pro_v1",
    plan: "PRO",
    payProvider: "INICIS",
    billingKey: "career-billing",
    nextPaymentAmount: 5900,
    planExpiresAt: careerExpiresAt,
    nextBillingAt: futureDate(1),
    pendingPlanId: "career_basic_v1",
    pendingPlan: "BASIC",
    pendingPlanStartsAt: careerExpiresAt,
  });

  try {
    const updated = await unscheduleProductPlanChange({
      teamId: team.id,
      product: "CAREER",
    });

    const career = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    const press = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });

    assert.equal(updated.pendingPlan, null);
    assert.equal(updated.pendingPlanId, null);
    assert.equal(updated.pendingPlanStartsAt, null);
    assert.equal(updated.nextPaymentAmount, getMonthlyAmountByPlanId("career_pro_v1"));
    assert.equal(press.planId, pressRow.planId);
    assert.equal(press.plan, pressRow.plan);
    assert.equal(updated.teamId, pressRow.teamId);
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("cancelProductSubscription is idempotent and writes exactly one cancel history row", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_pro_v1",
      plan: "PRO",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "career-billing",
      planExpiresAt: futureDate(2),
      nextBillingAt: futureDate(1),
      nextPaymentAmount: 12900,
    },
  });
  await createSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_pro_v1",
    plan: "PRO",
    payProvider: "INICIS",
    billingKey: "career-billing",
    planExpiresAt: futureDate(2),
    nextBillingAt: futureDate(1),
    nextPaymentAmount: 12900,
  });
  await createSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-billing",
    planExpiresAt: futureDate(2),
    nextBillingAt: futureDate(1),
    nextPaymentAmount: 9900,
  });

  try {
    const beforeHistory = await prisma.teamBillingHistory.count({
      where: {
        teamId: team.id,
        type: "CANCEL",
        meta: { path: ["product"], equals: "CAREER" } as never,
      },
    });

    await cancelProductSubscription({
      teamId: team.id,
      userId: user.id,
      product: "CAREER",
    });

    await cancelProductSubscription({
      teamId: team.id,
      userId: user.id,
      product: "CAREER",
    });

    const afterHistory = await prisma.teamBillingHistory.count({
      where: {
        teamId: team.id,
        type: "CANCEL",
        meta: { path: ["product"], equals: "CAREER" } as never,
      },
    });
    const career = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });

    assert.equal(career.membershipStatus, "CANCELED");
    assert.equal(!!career.cancelRequestedAt, true);
    assert.equal(afterHistory, beforeHistory + 1);
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("cancelProductSubscription rejects when called without an explicit product", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_basic_v1",
      plan: "BASIC",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "career-billing",
    },
  });
  await createSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_basic_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "career-billing",
  });

  try {
    const result = cancelProductSubscription({
      teamId: team.id,
      userId: user.id,
      // @ts-expect-error explicit product is required for phase 1
      product: undefined,
    });

    await assert.rejects(result, /PRODUCT_REQUIRED/);
  } finally {
    await cleanup({ teamId: team.id, userId: user.id });
  }
});

test("cancelProductSubscription failures in history write rollback product and legacy rows", async () => {
  const { user, team } = await createUserAndTeam({
    teamData: {
      planId: "career_pro_v1",
      plan: "PRO",
      planCategory: "CAREER",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: "career-billing",
      planExpiresAt: futureDate(2),
      nextBillingAt: futureDate(1),
      nextPaymentAmount: 12900,
    },
  });
  await createSubscription({
    teamId: team.id,
    product: "CAREER",
    planId: "career_pro_v1",
    plan: "PRO",
    payProvider: "INICIS",
    billingKey: "career-billing",
    planExpiresAt: futureDate(2),
    nextBillingAt: futureDate(1),
    nextPaymentAmount: 12900,
  });
  await createSubscription({
    teamId: team.id,
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-billing",
    planExpiresAt: futureDate(2),
    nextBillingAt: futureDate(1),
    nextPaymentAmount: 9900,
  });

  const originalTransaction = prisma.$transaction;
  const failingError = new Error("HISTORY_WRITE_FAILED");

  (prisma as any).$transaction = async (callback: any, options?: any) => {
    return originalTransaction.call(prisma, async (tx: any) => {
      const failingTx = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === "teamBillingHistory") {
            return new Proxy(target.teamBillingHistory, {
              get(historyTarget, historyProp, historyReceiver) {
                if (historyProp === "create") {
                  return async () => {
                    throw failingError;
                  };
                }
                return Reflect.get(historyTarget, historyProp, historyReceiver);
              },
            });
          }

          return Reflect.get(target, prop, receiver);
        },
      });

      return callback(failingTx);
    }, options);
  };

  try {
    const beforeTeam = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    const beforeCareer = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });

    await assert.rejects(
      cancelProductSubscription({
        teamId: team.id,
        userId: user.id,
        product: "CAREER",
      }),
      /HISTORY_WRITE_FAILED/,
    );

    const afterTeam = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    const afterCareer = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    const press = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });

    assert.equal(afterTeam.membershipStatus, beforeTeam.membershipStatus);
    assert.equal(afterTeam.nextPaymentAmount, beforeTeam.nextPaymentAmount);
    assert.equal(afterCareer.membershipStatus, beforeCareer.membershipStatus);
    assert.equal(afterCareer.cancelRequestedAt, beforeCareer.cancelRequestedAt);
    assert.equal(press.planId, "basic_monthly_v1");
  } finally {
    (prisma as any).$transaction = originalTransaction;
    await cleanup({ teamId: team.id, userId: user.id });
  }
});
