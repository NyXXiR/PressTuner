import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { createProductSubscriptionPaymentMethodRef } from "./paymentMethodReference";
import { createSubscriptionPaymentId } from "./paymentConfirmation";
import { completeOrRecoverSubscriptionChange } from "./completeOrRecoverSubscriptionChange";
import { recoverConfirmedSubscriptionChange } from "./subscriptionChangeRecovery";
import {
  reconcileConfirmedSubscriptionChanges,
  reconcileStalePendingSubscriptionChanges,
  resumeStalePendingSubscriptionChange,
} from "./subscriptionChangeReconciliation";

function withEnv<T>(values: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const PORTONE_TEST_ENV = {
  PORTONE_API_SECRET: "secret-test",
  PORTONE_STORE_ID: "store-test",
  PORTONE_CHANNEL_KEY_INICIS: "channel-key-inicis",
};

test("reconciliation directly recovers a confirmed unapplied subscription change without a webhook trigger", async () => {
  const suffix = randomUUID();
  const attemptId = randomUUID();
  const billingKey = `billing-key-reconcile-${suffix}`;
  const user = await prisma.user.create({
    data: {
      loginId: `change-reconcile-${suffix}`,
      label: "Subscription reconciliation fixture",
      email: `change-reconcile-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `change-reconcile-${suffix}`,
      name: "Subscription reconciliation fixture",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `RECOVER-${suffix.slice(0, 8)}`.toUpperCase(),
      name: "Provider-paid recovery coupon",
      status: "ACTIVE",
      benefitType: "FIXED_AMOUNT",
      discountAmount: 1000,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
    },
  });
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      planId: "free_v1",
      plan: "FREE",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey,
    },
  });
  const externalPaymentId = createSubscriptionPaymentId(
    "CAREER_BASIC",
    attemptId,
  );
  const change = await prisma.subscriptionChange.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      subscriptionId: subscription.id,
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      externalPaymentId,
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef: createProductSubscriptionPaymentMethodRef({
        subscriptionId: subscription.id,
        billingKey,
      }),
      paymentConfirmedAt: new Date("2026-07-22T08:00:00.000Z"),
      paymentStatus: "CONFIRMED",
      applyStatus: "PENDING",
      priceSnapshot: {
        version: 1,
        finalAmount: 4900,
        currency: "KRW",
        targetPlanId: "career_basic_v1",
        couponCode: coupon.code,
        calculatedAt: new Date().toISOString(),
      },
    },
  });
  const redemption = await prisma.couponRedemption.create({
    data: {
      couponId: coupon.id,
      userId: user.id,
      teamId: team.id,
      status: "APPLIED",
      discountAmount: 1000,
      appliedAt: new Date("2026-07-22T07:59:00.000Z"),
      meta: {
        code: coupon.code,
        benefitType: coupon.benefitType,
        attemptId,
        payNowAmountWon: 4900,
      },
    },
  });
  await prisma.teamProductSubscription.update({
    where: { id: subscription.id },
    data: { billingKey: `rotated-${billingKey}` },
  });
  try {
    assert.equal(
      await prisma.billingWebhookEvent.count({
        where: { teamId: team.id },
      }),
      0,
    );

    const result = await withEnv(PORTONE_TEST_ENV, () =>
      reconcileConfirmedSubscriptionChanges({ take: 10 }),
    );

    assert.deepEqual(result, { scanned: 1, applied: 1, failed: 0 });
    const recovered = await prisma.subscriptionChange.findUniqueOrThrow({
      where: { id: change.id },
    });
    assert.equal(recovered.paymentStatus, "CONFIRMED");
    assert.equal(recovered.applyStatus, "APPLIED");

    const recoveredSubscription =
      await prisma.teamProductSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
    assert.equal(recoveredSubscription.planId, "career_basic_v1");
    assert.equal(recoveredSubscription.membershipStatus, "ACTIVE");
    assert.equal(
      (
        await prisma.couponRedemption.findUniqueOrThrow({
          where: { id: redemption.id },
        })
      ).status,
      "REDEEMED",
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.coupon.deleteMany({ where: { id: coupon.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("zero-charge API and recovery workers converge without calling the provider", async () => {
  const suffix = randomUUID();
  const attemptId = randomUUID();
  const billingKey = `billing-key-nocharge-${suffix}`;
  const user = await prisma.user.create({
    data: {
      loginId: `change-nocharge-${suffix}`,
      label: "Zero-charge recovery fixture",
      email: `change-nocharge-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `change-nocharge-${suffix}`,
      name: "Zero-charge recovery fixture",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  const coupon = await prisma.coupon.create({
    data: {
      code: `NOCHARGE-${suffix.slice(0, 8)}`.toUpperCase(),
      name: "Zero-charge recovery coupon",
      status: "ACTIVE",
      benefitType: "PERCENT",
      discountPercent: 100,
      discountDuration: "ONCE",
      applicablePlanIds: ["career_basic_v1"],
    },
  });
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      planId: "free_v1",
      plan: "FREE",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey,
    },
  });
  const externalPaymentId = `nocharge_${attemptId}`;
  const change = await prisma.subscriptionChange.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      subscriptionId: subscription.id,
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      externalPaymentId,
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef: createProductSubscriptionPaymentMethodRef({
        subscriptionId: subscription.id,
        billingKey,
      }),
      paymentStatus: "NOT_REQUIRED",
      applyStatus: "PENDING",
      priceSnapshot: {
        version: 1,
        finalAmount: 0,
        currency: "KRW",
        targetPlanId: "career_basic_v1",
        couponCode: coupon.code,
        calculatedAt: new Date().toISOString(),
      },
    },
  });
  await prisma.teamBillingHistory.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "PAYMENT",
      status: "REQUESTED",
      provider: "INICIS",
      plan: "BASIC",
      planId: "career_basic_v1",
      product: "CAREER",
      subscriptionId: subscription.id,
      afterPlanId: "career_basic_v1",
      amount: 0,
      externalId: externalPaymentId,
      meta: {
        kind: "SUBSCRIPTION_PAYMENT_ATTEMPT",
        attemptId,
      },
    },
  });

  let providerCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    providerCalls += 1;
    throw new Error("ZERO_CHARGE_MUST_NOT_CALL_PROVIDER");
  }) as typeof fetch;

  try {
    const settled = await withEnv(PORTONE_TEST_ENV, () =>
      Promise.allSettled([
        completeOrRecoverSubscriptionChange({
          teamId: team.id,
          userId: user.id,
          planId: "career_basic_v1",
          payProvider: "inicis",
          billingKey,
          attemptId,
          couponCode: coupon.code,
        }),
        recoverConfirmedSubscriptionChange({ changeId: change.id }),
      ]),
    );
    const rejected = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejected) throw rejected.reason;
    const results = settled.map(
      (result) => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof recoverConfirmedSubscriptionChange>>>).value,
    );

    assert.deepEqual(
      results.map((result) => result.action).sort(),
      ["NO_CHANGE", "SUBSCRIBED_NO_CHARGE"],
    );
    assert.equal(providerCalls, 0);

    const recovered = await prisma.subscriptionChange.findUniqueOrThrow({
      where: { id: change.id },
    });
    assert.equal(recovered.paymentStatus, "NOT_REQUIRED");
    assert.equal(recovered.applyStatus, "APPLIED");
    assert.equal(
      await prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId: user.id, status: "REDEEMED" },
      }),
      1,
    );
  } finally {
    global.fetch = originalFetch;
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.coupon.deleteMany({ where: { id: coupon.id } });
  }
});

test("reconciliation escalates repeated precondition failures and stops automatic retries", async () => {
  const suffix = randomUUID();
  const attemptId = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `change-manual-review-${suffix}`,
      label: "Manual review fixture",
      email: `change-manual-review-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: {
      slug: `change-manual-review-${suffix}`,
      name: "Manual review fixture",
      planId: "free_v1",
      plan: "FREE",
      planCategory: "STANDARD",
      nextPaymentAmount: 0,
    },
  });
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      planId: "free_v1",
      plan: "FREE",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey: `billing-key-${suffix}`,
    },
  });
  const change = await prisma.subscriptionChange.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      subscriptionId: subscription.id,
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      externalPaymentId: createSubscriptionPaymentId("CAREER_BASIC", attemptId),
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef: "invalid-opaque-reference",
      paymentConfirmedAt: new Date("2026-07-22T08:59:00.000Z"),
      paymentStatus: "CONFIRMED",
      applyStatus: "PENDING",
      priceSnapshot: {
        version: 1,
        finalAmount: 5900,
        currency: "KRW",
        targetPlanId: "career_basic_v1",
        couponCode: null,
        calculatedAt: "2026-07-22T08:59:00.000Z",
      },
    },
  });
  const firstDueAt = new Date("2026-07-22T09:00:00.000Z");
  const secondDueAt = new Date("2026-07-22T09:01:00.000Z");
  const thirdDueAt = new Date("2026-07-22T09:03:00.000Z");

  try {
    assert.deepEqual(
      await reconcileConfirmedSubscriptionChanges({ now: firstDueAt, take: 10 }),
      { scanned: 1, applied: 0, failed: 1 },
    );
    assert.deepEqual(
      await reconcileConfirmedSubscriptionChanges({ now: secondDueAt, take: 10 }),
      { scanned: 1, applied: 0, failed: 1 },
    );
    assert.deepEqual(
      await reconcileConfirmedSubscriptionChanges({ now: thirdDueAt, take: 10 }),
      { scanned: 1, applied: 0, failed: 1 },
    );

    const escalated = await prisma.subscriptionChange.findUniqueOrThrow({
      where: { id: change.id },
    });
    assert.equal(escalated.applyStatus, "MANUAL_REVIEW");
    assert.equal(escalated.retryCount, 3);
    assert.match(
      escalated.lastError ?? "",
      /SUBSCRIPTION_PAYMENT_METHOD_REFERENCE_INVALID/,
    );
    assert.equal(escalated.nextRetryAt, null);

    assert.deepEqual(
      await reconcileConfirmedSubscriptionChanges({
        now: new Date("2026-07-23T09:00:00.000Z"),
        take: 10,
      }),
      { scanned: 0, applied: 0, failed: 0 },
    );
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("reconciliation resumes stale pending payments but leaves fresh attempts in progress", async () => {
  const suffix = randomUUID();
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      loginId: `change-pending-${suffix}`,
      label: "Pending reconciliation fixture",
      email: `change-pending-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: { slug: `change-pending-${suffix}`, name: "Pending reconciliation fixture" },
  });
  const billingKey = `billing-key-${suffix}`;
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      planId: "free_v1",
      plan: "FREE",
      payProvider: "INICIS",
      billingKey,
    },
  });
  const base = {
    teamId: team.id,
    product: "CAREER" as const,
    subscriptionId: subscription.id,
    changeType: "SUBSCRIBE",
    targetPlanId: "career_basic_v1",
    requesterUserId: user.id,
    payProvider: "INICIS" as const,
    paymentMethodRef: createProductSubscriptionPaymentMethodRef({
      subscriptionId: subscription.id,
      billingKey,
    }),
    paymentStatus: "PENDING" as const,
    applyStatus: "PENDING" as const,
    priceSnapshot: { finalAmount: 5_900, currency: "KRW", targetPlanId: "career_basic_v1" },
  };

  try {
    const stale = await prisma.subscriptionChange.create({
      data: {
        ...base,
        idempotencyKey: `pending:stale:${suffix}`,
        externalPaymentId: `payment:stale:${suffix}`,
        createdAt: new Date(now.getTime() - 6 * 60_000),
      },
    });
    await prisma.subscriptionChange.create({
      data: {
        ...base,
        idempotencyKey: `pending:fresh:${suffix}`,
        externalPaymentId: `payment:fresh:${suffix}`,
        createdAt: new Date(now.getTime() - 60_000),
      },
    });
    const resumed: string[] = [];

    const result = await reconcileStalePendingSubscriptionChanges({
      now,
      take: 10,
      recover: async ({ changeId }) => {
        resumed.push(changeId);
      },
    });

    assert.deepEqual(result, { scanned: 1, resumed: 1, failed: 0 });
    assert.deepEqual(resumed, [stale.id]);
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("stale pending recovery reconstructs the persisted provider identity", async () => {
  const suffix = randomUUID();
  const attemptId = randomUUID();
  const billingKey = `billing-key-resume-${suffix}`;
  const user = await prisma.user.create({
    data: {
      loginId: `change-resume-${suffix}`,
      label: "Pending replay fixture",
      email: `change-resume-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: { slug: `change-resume-${suffix}`, name: "Pending replay fixture" },
  });
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      planId: "free_v1",
      plan: "FREE",
      payProvider: "INICIS",
      billingKey,
    },
  });
  const paymentMethodRef = createProductSubscriptionPaymentMethodRef({
    subscriptionId: subscription.id,
    billingKey,
  });
  const externalPaymentId = createSubscriptionPaymentId("CAREER_BASIC", attemptId);
  const change = await prisma.subscriptionChange.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      subscriptionId: subscription.id,
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `subscription-change:${team.id}:CAREER:${attemptId}`,
      externalPaymentId,
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef,
      paymentStatus: "PENDING",
      applyStatus: "PENDING",
      priceSnapshot: {
        version: 1,
        finalAmount: 5_900,
        currency: "KRW",
        targetPlanId: "career_basic_v1",
        couponCode: null,
      },
      createdAt: new Date(Date.now() - 6 * 60_000),
    },
  });
  const completionCalls: Array<Record<string, unknown>> = [];

  try {
    await resumeStalePendingSubscriptionChange({
      changeId: change.id,
      complete: async (args) => {
        completionCalls.push(args as unknown as Record<string, unknown>);
      },
    });

    assert.equal(completionCalls.length, 1);
    const completionArgs = completionCalls[0]!;
    assert.equal(completionArgs.teamId, team.id);
    assert.equal(completionArgs.userId, user.id);
    assert.equal(completionArgs.planId, "career_basic_v1");
    assert.equal(completionArgs.payProvider, "inicis");
    assert.equal(completionArgs.billingKey, billingKey);
    assert.equal(completionArgs.attemptId, attemptId);
    assert.equal(completionArgs.couponCode, null);
    assert.deepEqual(completionArgs.recovery, {
      changeId: change.id,
      changeType: "SUBSCRIBE",
      finalAmount: 5_900,
      couponCode: null,
      paymentMethodRef,
      paymentExternalId: externalPaymentId,
      pastDueRecovery: false,
    });
  } finally {
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
