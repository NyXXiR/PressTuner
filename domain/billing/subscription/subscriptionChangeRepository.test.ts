import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  markSubscriptionChangeApplyFailed,
  markSubscriptionChangeApplied,
  markSubscriptionChangePaymentConfirmed,
  prepareSubscriptionChange,
  prepareSubscriptionChangeWithPaymentMethod,
} from "./subscriptionChangeRepository";

test("subscription change persists idempotent payment and apply axes", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: { slug: `change-${suffix}`, name: "Subscription change fixture" },
  });
  const idempotencyKey = `change:${suffix}`;

  try {
    const first = await prepareSubscriptionChange({
      teamId: team.id,
      product: "CAREER",
      changeType: "SUBSCRIBE",
      targetPlanId: "career_pro_v1",
      idempotencyKey,
      paymentRequired: true,
      priceSnapshot: {
        finalAmount: 12_900,
        currency: "KRW",
        calculatedAt: new Date().toISOString(),
      },
    });
    const replay = await prepareSubscriptionChange({
      teamId: team.id,
      product: "CAREER",
      changeType: "SUBSCRIBE",
      targetPlanId: "career_pro_v1",
      idempotencyKey,
      paymentRequired: true,
      priceSnapshot: {
        finalAmount: 12_900,
        currency: "KRW",
        calculatedAt: new Date().toISOString(),
      },
    });
    assert.equal(replay.id, first.id);
    assert.equal(
      await prisma.subscriptionChange.count({ where: { idempotencyKey } }),
      1,
    );

    const confirmed = await markSubscriptionChangePaymentConfirmed({
      id: first.id,
      externalPaymentId: `payment:${suffix}`,
    });
    assert.equal(confirmed.paymentStatus, "CONFIRMED");
    assert.equal(confirmed.applyStatus, "PENDING");

    const failed = await markSubscriptionChangeApplyFailed({
      id: first.id,
      error: "LOCAL_APPLY_FAILED",
    });
    assert.equal(failed.paymentStatus, "CONFIRMED");
    assert.equal(failed.applyStatus, "FAILED");

    const applied = await markSubscriptionChangeApplied({ id: first.id });
    assert.equal(applied.paymentStatus, "CONFIRMED");
    assert.equal(applied.applyStatus, "APPLIED");
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
  }
});

test("subscription change cannot apply before required payment confirmation", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: { slug: `change-illegal-${suffix}`, name: "Illegal change fixture" },
  });

  try {
    const change = await prepareSubscriptionChange({
      teamId: team.id,
      product: "PRESS",
      changeType: "SUBSCRIBE",
      targetPlanId: "pro_monthly_v1",
      idempotencyKey: `illegal:${suffix}`,
      paymentRequired: true,
      priceSnapshot: { finalAmount: 29_000, currency: "KRW" },
    });
    await assert.rejects(
      markSubscriptionChangeApplied({ id: change.id }),
      /SUBSCRIPTION_CHANGE_ILLEGAL_TRANSITION/,
    );
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
  }
});

test("subscription change preparation rolls back when its authoritative payment method cannot be stored", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: { slug: `change-atomic-${suffix}`, name: "Atomic preparation fixture" },
  });
  const idempotencyKey = `operation:atomic:${suffix}`;

  try {
    await assert.rejects(
      prepareSubscriptionChangeWithPaymentMethod({
        teamId: team.id,
        product: "CAREER",
        subscriptionId: `missing-subscription-${suffix}`,
        changeType: "SUBSCRIBE",
        targetPlanId: "career_basic_v1",
        idempotencyKey,
        externalPaymentId: `payment:${suffix}`,
        requesterUserId: null,
        payProvider: "INICIS",
        paymentMethodRef: `payment-method:${suffix}`,
        paymentRequired: true,
        priceSnapshot: { finalAmount: 5_900, currency: "KRW" },
        billingKey: `billing-key-${suffix}`,
      }),
      /SUBSCRIPTION_PAYMENT_METHOD_REFERENCE_INVALID/,
    );

    assert.equal(
      await prisma.subscriptionChange.count({ where: { idempotencyKey } }),
      0,
    );
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
  }
});

test("subscription change persists the non-secret references required for local apply replay", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      loginId: `change-replay-${suffix}`,
      label: "Subscription replay fixture",
      email: `change-replay-${suffix}@example.com`,
    },
  });
  const team = await prisma.team.create({
    data: { slug: `change-replay-${suffix}`, name: "Subscription replay fixture" },
  });
  const paymentConfirmedAt = new Date("2026-07-22T08:00:00.000Z");
  const paymentMethodRef = `payment-method:${suffix}`;

  try {
    const prepared = await prepareSubscriptionChange({
      teamId: team.id,
      product: "CAREER",
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `replay:${suffix}`,
      externalPaymentId: `payment:${suffix}`,
      paymentRequired: true,
      priceSnapshot: { finalAmount: 5_900, currency: "KRW" },
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef,
    } as Parameters<typeof prepareSubscriptionChange>[0] & {
      requesterUserId: string;
      payProvider: "INICIS";
      paymentMethodRef: string;
    });

    assert.equal((prepared as Record<string, unknown>).requesterUserId, user.id);
    assert.equal((prepared as Record<string, unknown>).payProvider, "INICIS");
    assert.equal(
      (prepared as Record<string, unknown>).paymentMethodRef,
      paymentMethodRef,
    );
    assert.equal("billingKey" in prepared, false);

    const confirmed = await markSubscriptionChangePaymentConfirmed({
      id: prepared.id,
      externalPaymentId: `payment:${suffix}`,
      paymentConfirmedAt,
    } as Parameters<typeof markSubscriptionChangePaymentConfirmed>[0] & {
      paymentConfirmedAt: Date;
    });

    const persistedPaymentConfirmedAt = (
      confirmed as Record<string, unknown>
    ).paymentConfirmedAt as Date | undefined;
    if (!(persistedPaymentConfirmedAt instanceof Date)) {
      throw new Error("payment confirmation time must be persisted as a Date");
    }
    assert.equal(
      persistedPaymentConfirmedAt.toISOString(),
      paymentConfirmedAt.toISOString(),
    );
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
});

test("subscription change rejects a duplicate external payment id across different operations", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: { slug: `change-payment-id-${suffix}`, name: "Payment id collision fixture" },
  });
  const externalPaymentId = `payment:${suffix}`;

  try {
    await prepareSubscriptionChange({
      teamId: team.id,
      product: "CAREER",
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `operation:first:${suffix}`,
      externalPaymentId,
      paymentRequired: true,
      priceSnapshot: { finalAmount: 5_900, currency: "KRW" },
    });

    await assert.rejects(
      prepareSubscriptionChange({
        teamId: team.id,
        product: "CAREER",
        changeType: "SUBSCRIBE",
        targetPlanId: "career_basic_v1",
        idempotencyKey: `operation:second:${suffix}`,
        externalPaymentId,
        paymentRequired: true,
        priceSnapshot: { finalAmount: 5_900, currency: "KRW" },
      }),
      /SUBSCRIPTION_CHANGE_EXTERNAL_PAYMENT_CONFLICT/,
    );

    assert.equal(
      await prisma.subscriptionChange.count({ where: { externalPaymentId } }),
      1,
    );
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
  }
});

test("subscription change failures back off and escalate to manual review", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({
    data: { slug: `change-retry-${suffix}`, name: "Retry escalation fixture" },
  });
  const now = new Date("2026-07-22T09:00:00.000Z");

  try {
    const change = await prepareSubscriptionChange({
      teamId: team.id,
      product: "CAREER",
      changeType: "SUBSCRIBE",
      targetPlanId: "career_basic_v1",
      idempotencyKey: `operation:retry:${suffix}`,
      externalPaymentId: `nocharge_${suffix}`,
      paymentRequired: false,
      priceSnapshot: { finalAmount: 0, currency: "KRW" },
    });

    const first = await markSubscriptionChangeApplyFailed({
      id: change.id,
      error: "first local apply failure",
      now,
    });
    assert.equal(first.applyStatus, "FAILED");
    assert.equal(first.retryCount, 1);
    assert.equal(first.lastError, "first local apply failure");
    assert.equal(first.nextRetryAt?.toISOString(), "2026-07-22T09:01:00.000Z");

    const second = await markSubscriptionChangeApplyFailed({
      id: change.id,
      error: "second local apply failure",
      now,
    });
    assert.equal(second.applyStatus, "FAILED");
    assert.equal(second.retryCount, 2);
    assert.equal(second.lastError, "second local apply failure");
    assert.equal(second.nextRetryAt?.toISOString(), "2026-07-22T09:02:00.000Z");

    const third = await markSubscriptionChangeApplyFailed({
      id: change.id,
      error: "third local apply failure",
      now,
    });
    assert.equal(third.applyStatus, "MANUAL_REVIEW");
    assert.equal(third.retryCount, 3);
    assert.equal(third.lastError, "third local apply failure");
    assert.equal(third.nextRetryAt, null);
  } finally {
    await prisma.team.delete({ where: { id: team.id } }).catch(() => {});
  }
});
