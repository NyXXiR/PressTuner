import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { nextChargeAtFromExpiresAtExclusive } from "@/domain/billing/teamMembership";
import { redeemCouponForTeam } from "@/lib/services/couponRedeemService";

function futureDate(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

async function createUserAndTeam(prefix = "coupon-redeem-test") {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `${prefix}-${suffix}`,
      label: `Coupon Redeem Test ${suffix.slice(0, 8)}`,
      email: `${prefix}-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `${prefix}-${suffix}`,
      name: `Coupon Redeem Test ${suffix.slice(0, 8)}`,
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });

  return { user, team };
}

async function createSubscription(
  teamId: string,
  data: {
    product: "PRESS" | "CAREER";
    planId: string;
    plan: PlanType;
    membershipStatus?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    payProvider?: "INICIS" | "KAKAOPAY" | null;
    billingKey?: string | null;
    planExpiresAt?: Date | null;
    nextBillingAt?: Date | null;
    pendingPlan?: PlanType | null;
    pendingPlanId?: string | null;
    pendingPlanStartsAt?: Date | null;
    cancelRequestedAt?: Date | null;
    nextPaymentAmount?: number;
    lastPaymentId?: string | null;
    lastPaidAt?: Date | null;
  },
) {
  return prisma.teamProductSubscription.create({
    data: {
      teamId,
      product: data.product,
      planId: data.planId,
      plan: data.plan,
      membershipStatus: data.membershipStatus ?? "ACTIVE",
      payProvider: data.payProvider ?? null,
      billingKey: data.billingKey ?? null,
      nextPaymentAmount: data.nextPaymentAmount ?? 0,
      planExpiresAt: data.planExpiresAt ?? null,
      nextBillingAt: data.nextBillingAt ?? null,
      pendingPlan: data.pendingPlan ?? null,
      pendingPlanId: data.pendingPlanId ?? null,
      pendingPlanStartsAt: data.pendingPlanStartsAt ?? null,
      cancelRequestedAt: data.cancelRequestedAt ?? null,
      lastPaymentId: data.lastPaymentId ?? null,
      lastPaidAt: data.lastPaidAt ?? null,
    },
  });
}

async function cleanup(args: {
  userIds: string[];
  teamIds: string[];
  couponIds: string[];
}) {
  await prisma.couponRedemption.deleteMany({
    where: {
      OR: [
        { userId: { in: args.userIds } },
        { teamId: { in: args.teamIds } },
        { couponId: { in: args.couponIds } },
      ],
    },
  });
  await prisma.teamBillingHistory.deleteMany({
    where: {
      OR: [{ userId: { in: args.userIds } }, { teamId: { in: args.teamIds } }],
    },
  });
  await prisma.coupon.deleteMany({ where: { id: { in: args.couponIds } } });
  await prisma.team.deleteMany({ where: { id: { in: args.teamIds } } });
  await prisma.user.deleteMany({ where: { id: { in: args.userIds } } });
}

function getMeta(redemption: { meta: any }) {
  return redemption.meta as Record<string, unknown>;
}

test("redeemCouponForTeam applies PRESS-paid team with CAREER grant and keeps CAREER scope", async () => {
  const { user, team } = await createUserAndTeam();
  const pressBoundary = futureDate(30);

  const pressBefore = await createSubscription(team.id, {
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-key",
    planExpiresAt: pressBoundary,
    nextBillingAt: futureDate(29),
    nextPaymentAmount: 9900,
  });
  await createSubscription(team.id, {
    product: "CAREER",
    planId: "free_v1",
    plan: "FREE",
    membershipStatus: "ACTIVE",
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `GRANT-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "One Month Career Pro",
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: "career_pro_v1",
      grantPlanType: "PRO",
      grantPlanCategory: "CAREER",
      grantMonths: 1,
      applicablePlanIds: ["career_pro_v1"],
      maxRedemptionsPerUser: 1,
    },
  });

  try {
    const result = await redeemCouponForTeam({
      team,
      user,
      code: coupon.code,
    });

    const pressAfter = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });
    const careerAfter = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { couponId: coupon.id, userId: user.id },
      orderBy: { redeemedAt: "desc" },
    });

    assert.equal(result.team.plan, "PRO");
    assert.equal(result.team.planId, "career_pro_v1");
    assert.equal(careerAfter.planId, "career_pro_v1");
    assert.equal(careerAfter.plan, "PRO");
    assert.equal(careerAfter.payProvider, null);
    assert.equal(careerAfter.billingKey, null);
    assert.equal(careerAfter.nextBillingAt, null);
    assert.equal(careerAfter.pendingPlan, null);
    assert.equal(pressAfter.planId, pressBefore.planId);
    assert.equal(pressAfter.billingKey, pressBefore.billingKey);
    assert.equal(pressAfter.payProvider, pressBefore.payProvider);

    const meta = getMeta(redemption);
    assert.equal(meta.product, "CAREER");
    assert.equal(meta.subscriptionId, careerAfter.id);
    assert.equal(meta.grantedPlanId, "career_pro_v1");
    assert.equal(meta.previousPlanId, "free_v1");
    assert.equal(meta.autoRenew, false);
    assert.equal(meta.previousBoundary, null);
    assert.equal(meta.grantBoundary, careerAfter.planExpiresAt?.toISOString());
    assert.equal(redemption.product, "CAREER");
    assert.equal(redemption.subscriptionId, careerAfter.id);
    assert.equal(redemption.beforePlanId, "free_v1");
    assert.equal(redemption.afterPlanId, "career_pro_v1");
    assert.equal(redemption.beforeStatus, "ACTIVE");
    assert.equal(redemption.afterStatus, "ACTIVE");

    const history = await prisma.teamBillingHistory.findFirstOrThrow({
      where: { teamId: team.id },
      orderBy: { occurredAt: "desc" },
    });
    assert.equal(history.product, "CAREER");
    assert.equal(history.subscriptionId, careerAfter.id);
    assert.equal(history.beforePlanId, "free_v1");
    assert.equal(history.afterPlanId, "career_pro_v1");
  } finally {
    await cleanup({
      userIds: [user.id],
      teamIds: [team.id],
      couponIds: [coupon.id],
    });
  }
});

test("redeemCouponForTeam applies CAREER-paid team with PRESS auto-renew grant and keeps CAREER untouched", async () => {
  const { user, team } = await createUserAndTeam();

  await createSubscription(team.id, {
    product: "CAREER",
    planId: "career_pro_v1",
    plan: "PRO",
    payProvider: "INICIS",
    billingKey: "career-key",
    planExpiresAt: futureDate(30),
    nextBillingAt: futureDate(29),
    nextPaymentAmount: 12900,
  });
  const pressBefore = await createSubscription(team.id, {
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "KAKAOPAY",
    billingKey: "press-key",
    planExpiresAt: futureDate(20),
    nextBillingAt: futureDate(19),
    nextPaymentAmount: 9900,
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `PRESS-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Auto-renewing Press Coupon",
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: "pro_monthly_v1",
      grantPlanType: "PRO",
      grantPlanCategory: "PRESS",
      grantMonths: 1,
      meta: { autoRenew: true },
      applicablePlanIds: ["pro_monthly_v1"],
      maxRedemptionsPerUser: 1,
    },
  });

  try {
    const result = await redeemCouponForTeam({
      team,
      user,
      code: coupon.code,
    });

    const pressAfter = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });
    const careerAfter = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });
    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { couponId: coupon.id, userId: user.id },
      orderBy: { redeemedAt: "desc" },
    });

    assert.equal(result.team.plan, "PRO");
    assert.equal(result.team.planId, "pro_monthly_v1");
    assert.equal(pressAfter.planId, "pro_monthly_v1");
    assert.equal(pressAfter.payProvider, "KAKAOPAY");
    assert.equal(pressAfter.billingKey, "press-key");
    assert.equal(pressAfter.pendingPlan, pressBefore.plan);
    assert.equal(pressAfter.pendingPlanId, pressBefore.planId);
    assert.equal(pressAfter.nextPaymentAmount, pressBefore.nextPaymentAmount);
    assert.equal(pressAfter.pendingPlanStartsAt?.toISOString(), pressAfter.planExpiresAt?.toISOString());
    assert.equal(
      pressAfter.nextBillingAt?.toISOString(),
      nextChargeAtFromExpiresAtExclusive(pressAfter.planExpiresAt!).toISOString(),
    );
    assert.equal(careerAfter.planId, "career_pro_v1");

    const meta = getMeta(redemption);
    assert.equal(meta.product, "PRESS");
    assert.equal(meta.subscriptionId, pressAfter.id);
    assert.equal(meta.grantedPlanId, "pro_monthly_v1");
    assert.equal(meta.autoRenew, true);
  } finally {
    await cleanup({
      userIds: [user.id],
      teamIds: [team.id],
      couponIds: [coupon.id],
    });
  }
});

test("redeemCouponForTeam changes only targeted row when both products are already paid", async () => {
  const { user, team } = await createUserAndTeam();

  const pressBefore = await createSubscription(team.id, {
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-key",
    planExpiresAt: futureDate(40),
    nextBillingAt: futureDate(39),
    nextPaymentAmount: 9900,
  });
  const careerBefore = await createSubscription(team.id, {
    product: "CAREER",
    planId: "career_basic_v1",
    plan: "BASIC",
    payProvider: "KAKAOPAY",
    billingKey: "career-key",
    planExpiresAt: futureDate(40),
    nextBillingAt: futureDate(39),
    nextPaymentAmount: 5900,
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `PRESS-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "PRESS Coupon",
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: "pro_monthly_v1",
      grantPlanType: "PRO",
      grantPlanCategory: "PRESS",
      grantMonths: 1,
      applicablePlanIds: ["pro_monthly_v1"],
      maxRedemptionsPerUser: 1,
    },
  });

  try {
    await redeemCouponForTeam({
      team,
      user,
      code: coupon.code,
    });

    const pressAfter = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });
    const careerAfter = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "CAREER" } },
    });

    assert.equal(pressAfter.planId, "pro_monthly_v1");
    assert.equal(careerAfter.planId, careerBefore.planId);
    assert.equal(careerAfter.plan, careerBefore.plan);
    assert.equal(careerAfter.payProvider, careerBefore.payProvider);
    assert.equal(careerAfter.billingKey, careerBefore.billingKey);
    assert.equal(careerAfter.pendingPlanId, careerBefore.pendingPlanId);
    assert.equal(careerAfter.nextPaymentAmount, careerBefore.nextPaymentAmount);
  } finally {
    await cleanup({
      userIds: [user.id],
      teamIds: [team.id],
      couponIds: [coupon.id],
    });
  }
});

test("redeemCouponForTeam enforces duplicate and concurrent redemption constraints", async () => {
  const first = await createUserAndTeam("coupon-limit-a");
  const second = await createUserAndTeam("coupon-limit-b");
  const coupon = await prisma.coupon.create({
    data: {
      code: `LIMIT-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Single Use Career Pro",
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: "career_pro_v1",
      grantPlanType: "PRO",
      grantPlanCategory: "CAREER",
      grantMonths: 1,
      applicablePlanIds: ["career_pro_v1"],
      maxRedemptions: 1,
    },
  });

  try {
    const results = await Promise.allSettled([
      redeemCouponForTeam({
        team: first.team,
        user: first.user,
        code: coupon.code,
      }),
      redeemCouponForTeam({
        team: second.team,
        user: second.user,
        code: coupon.code,
      }),
    ]);

    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1,
    );

    const redemptionCount = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, status: "REDEEMED" },
    });
    assert.equal(redemptionCount, 1);
  } finally {
    await cleanup({
      userIds: [first.user.id, second.user.id],
      teamIds: [first.team.id, second.team.id],
      couponIds: [coupon.id],
    });
  }
});

test("redeemCouponForTeam rolls back product and team snapshot when history write fails", async () => {
  const { user, team } = await createUserAndTeam();

  const before = await createSubscription(team.id, {
    product: "PRESS",
    planId: "basic_monthly_v1",
    plan: "BASIC",
    payProvider: "INICIS",
    billingKey: "press-key",
    planExpiresAt: futureDate(30),
    nextBillingAt: futureDate(29),
    nextPaymentAmount: 9900,
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `ROLLBACK-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: "Rollback Coupon",
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: "pro_monthly_v1",
      grantPlanType: "PRO",
      grantPlanCategory: "PRESS",
      grantMonths: 1,
      applicablePlanIds: ["pro_monthly_v1"],
    },
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
    await assert.rejects(
      redeemCouponForTeam({
        team,
        user,
        code: coupon.code,
      }),
      /HISTORY_WRITE_FAILED/,
    );

    const after = await prisma.teamProductSubscription.findUniqueOrThrow({
      where: { teamId_product: { teamId: team.id, product: "PRESS" } },
    });
    const historyCount = await prisma.teamBillingHistory.count({
      where: { teamId: team.id, type: "PAYMENT" },
    });
    const redemptionCount = await prisma.couponRedemption.count({
      where: { couponId: coupon.id },
    });

    assert.equal(after.planId, before.planId);
    assert.equal(after.planExpiresAt?.getTime(), before.planExpiresAt?.getTime());
    assert.equal(after.billingKey, before.billingKey);
    assert.equal(after.payProvider, before.payProvider);
    assert.equal(after.nextPaymentAmount, before.nextPaymentAmount);
    assert.equal(historyCount, 0);
    assert.equal(redemptionCount, 0);
  } finally {
    (prisma as any).$transaction = originalTransaction;
    await cleanup({
      userIds: [user.id],
      teamIds: [team.id],
      couponIds: [coupon.id],
    });
  }
});
