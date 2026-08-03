import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  auditRecentSuccessfulBillingPayments,
  detectDuplicateSuccessfulBillingAttempts,
  processBillingWebhookEvent,
  reconcilePendingBillingWebhookEvents,
  reconcileStaleRequestedBillingPayments,
  recordVerifiedPortoneWebhook,
} from "@/domain/billing/webhook/portone";
import { getPlan } from "@/config/billing/plans";
import { createSubscriptionPaymentId } from "@/domain/billing/subscription/paymentConfirmation";
import { createProductSubscriptionPaymentMethodRef } from "@/domain/billing/subscription/paymentMethodReference";
import { prisma } from "@/lib/prisma";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture() {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `webhook-${suffix}@example.com`,
      loginId: `webhook-${suffix}`,
      label: "user",
    },
  });
  const team = await prisma.team.create({
    data: {
      name: `webhook-${suffix}`,
      slug: `webhook-${suffix}`,
      plan: "PRO",
      planId: "pro_monthly_v1",
      membershipStatus: "ACTIVE",
    },
  });
  await prisma.teamMember.create({
    data: { teamId: team.id, userId: user.id, role: "OWNER" },
  });
  const press = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "PRESS",
      plan: "PRO",
      planId: "pro_monthly_v1",
      membershipStatus: "ACTIVE",
      nextPaymentAmount: 0,
      payProvider: "INICIS",
      billingKey: `billing-key-${suffix}`,
    },
  });
  const career = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      plan: "BASIC",
      planId: "career_basic_v1",
      membershipStatus: "ACTIVE",
      nextPaymentAmount: 0,
      lastPaymentId: `career-before-${suffix}`,
    },
  });
  const attemptId = randomUUID();
  const paymentId = createSubscriptionPaymentId(getPlan("pro_monthly_v1").code, attemptId);
  const change = await prisma.subscriptionChange.create({
    data: {
      teamId: team.id,
      product: "PRESS",
      subscriptionId: press.id,
      changeType: "RENEW",
      targetPlanId: "pro_monthly_v1",
      idempotencyKey: `subscription-change:${team.id}:PRESS:${attemptId}`,
      externalPaymentId: paymentId,
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef: createProductSubscriptionPaymentMethodRef({
        subscriptionId: press.id,
        billingKey: `billing-key-${suffix}`,
      }),
      priceSnapshot: {
        version: 1,
        finalAmount: 1000,
        currency: "KRW",
        targetPlanId: "pro_monthly_v1",
        couponCode: null,
        calculatedAt: new Date().toISOString(),
      },
      paymentStatus: "PENDING",
      applyStatus: "PENDING",
    },
  });
  const history = await prisma.teamBillingHistory.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "PAYMENT",
      status: "REQUESTED",
      provider: "INICIS",
      plan: "PRO",
      planId: "pro_monthly_v1",
      product: "PRESS",
      subscriptionId: press.id,
      afterPlanId: "pro_monthly_v1",
      amount: 1000,
      externalId: paymentId,
    },
  });
  return { user, team, press, career, change, history, paymentId, suffix };
}

async function cleanup(fixture: Fixture) {
  await prisma.billingWebhookEvent.deleteMany({
    where: { paymentId: fixture.paymentId },
  });
  await prisma.team.deleteMany({ where: { id: fixture.team.id } });
  await prisma.user.deleteMany({ where: { id: fixture.user.id } });
}

test("duplicate PortOne transmissions are stored once", async () => {
  const fixture = await createFixture();
  try {
    const transmissionId = `tx-${fixture.suffix}`;
    const [first, second] = await Promise.all([
      recordVerifiedPortoneWebhook({
        transmissionId,
        eventType: "Transaction.Paid",
        paymentId: fixture.paymentId,
        payload: { type: "Transaction.Paid", data: { paymentId: fixture.paymentId } },
      }),
      recordVerifiedPortoneWebhook({
        transmissionId,
        eventType: "Transaction.Paid",
        paymentId: fixture.paymentId,
        payload: { type: "Transaction.Paid", data: { paymentId: fixture.paymentId } },
      }),
    ]);

    assert.equal(first.event.id, second.event.id);
    assert.equal(Number(first.duplicate) + Number(second.duplicate), 1);
    assert.equal(
      await prisma.billingWebhookEvent.count({ where: { transmissionId } }),
      1,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("provider current state wins over out-of-order event and only target product converges", async () => {
  const fixture = await createFixture();
  let fetchCount = 0;
  try {
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `failed-arrived-late-${fixture.suffix}`,
      eventType: "Transaction.Failed",
      paymentId: fixture.paymentId,
      payload: { type: "Transaction.Failed", data: { paymentId: fixture.paymentId } },
    });

    const processed = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => {
        fetchCount += 1;
        return {
          id: fixture.paymentId,
          status: "PAID",
          paidAt: "2026-07-21T01:00:00.000Z",
          amount: { total: 1000 },
          currency: "KRW",
          receiptUrl: "https://example.com/receipt",
        };
      },
    });

    assert.equal(processed.status, "PROCESSED");
    const [history, press, career, event] = await Promise.all([
      prisma.teamBillingHistory.findUniqueOrThrow({ where: { id: fixture.history.id } }),
      prisma.teamProductSubscription.findUniqueOrThrow({ where: { id: fixture.press.id } }),
      prisma.teamProductSubscription.findUniqueOrThrow({ where: { id: fixture.career.id } }),
      prisma.billingWebhookEvent.findUniqueOrThrow({ where: { id: recorded.event.id } }),
    ]);
    assert.equal(history.status, "SUCCESS");
    assert.equal(history.receiptUrl, "https://example.com/receipt");
    assert.equal(press.lastPaymentId, fixture.paymentId);
    assert.equal(career.lastPaymentId, `career-before-${fixture.suffix}`);
    assert.equal(event.status, "PROCESSED");

    await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => {
        fetchCount += 1;
        throw new Error("must not refetch processed event");
      },
    });
    assert.equal(fetchCount, 1);
  } finally {
    await cleanup(fixture);
  }
});

test("definitive provider failure releases the same-attempt coupon reservation", async () => {
  const fixture = await createFixture();
  const coupon = await prisma.coupon.create({
    data: {
      code: `FAILED-${fixture.suffix.slice(0, 8)}`.toUpperCase(),
      name: "Failed payment coupon fixture",
      status: "ACTIVE",
      benefitType: "FIXED_AMOUNT",
      discountAmount: 100,
      discountDuration: "ONCE",
      applicablePlanIds: ["pro_monthly_v1"],
    },
  });
  const attemptId = fixture.change.idempotencyKey.split(":").at(-1)!;
  const redemption = await prisma.couponRedemption.create({
    data: {
      couponId: coupon.id,
      userId: fixture.user.id,
      teamId: fixture.team.id,
      status: "APPLIED",
      discountAmount: 100,
      appliedAt: new Date(),
      meta: {
        attemptId,
        code: coupon.code,
        payNowAmountWon: 1000,
      },
    },
  });
  await prisma.subscriptionChange.update({
    where: { id: fixture.change.id },
    data: {
      priceSnapshot: {
        version: 1,
        finalAmount: 1000,
        currency: "KRW",
        targetPlanId: "pro_monthly_v1",
        couponCode: coupon.code,
        calculatedAt: new Date().toISOString(),
      },
    },
  });

  try {
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `failed-coupon-${fixture.suffix}`,
      eventType: "Transaction.Failed",
      paymentId: fixture.paymentId,
      payload: {
        type: "Transaction.Failed",
        data: { paymentId: fixture.paymentId },
      },
    });
    const processed = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => ({
        id: fixture.paymentId,
        status: "FAILED",
      }),
    });
    assert.equal(processed.status, "PROCESSED");
    assert.equal(
      (await prisma.couponRedemption.findUniqueOrThrow({
        where: { id: redemption.id },
      })).status,
      "CANCELED",
    );
  } finally {
    await cleanup(fixture);
    await prisma.coupon.deleteMany({ where: { id: coupon.id } });
  }
});

test("paid webhook rejects provider amount or currency mismatches before confirmation", async () => {
  const fixture = await createFixture();
  try {
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `amount-mismatch-${fixture.suffix}`,
      eventType: "Transaction.Paid",
      paymentId: fixture.paymentId,
      payload: {
        type: "Transaction.Paid",
        data: { paymentId: fixture.paymentId },
      },
    });

    const processed = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => ({
        id: fixture.paymentId,
        status: "PAID",
        paidAt: "2026-07-21T01:00:00.000Z",
        amount: { total: 999 },
        currency: "KRW",
      }),
    });
    assert.equal(processed.status, "RETRYABLE");
    assert.match(processed.lastError ?? "", /PROVIDER_PAYMENT_AMOUNT_MISMATCH/);

    const [change, history] = await Promise.all([
      prisma.subscriptionChange.findUniqueOrThrow({
        where: { id: fixture.change.id },
      }),
      prisma.teamBillingHistory.findUniqueOrThrow({
        where: { id: fixture.history.id },
      }),
    ]);
    assert.equal(change.paymentStatus, "PENDING");
    assert.equal(history.status, "REQUESTED");
  } finally {
    await cleanup(fixture);
  }
});

test("provider cancellation makes an unapplied operation terminal and excludes stale recovery", async () => {
  const fixture = await createFixture();
  try {
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `cancel-${fixture.suffix}`,
      eventType: "Transaction.Cancelled",
      paymentId: fixture.paymentId,
      payload: {
        type: "Transaction.Cancelled",
        data: { paymentId: fixture.paymentId },
      },
    });

    const processed = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => ({
        id: fixture.paymentId,
        status: "CANCELLED",
        cancelledAt: "2026-07-21T01:00:00.000Z",
      }),
    });
    assert.equal(processed.status, "PROCESSED");

    const change = await prisma.subscriptionChange.findUniqueOrThrow({
      where: { id: fixture.change.id },
    });
    assert.equal(change.paymentStatus, "PENDING");
    assert.equal(change.applyStatus, "MANUAL_REVIEW");
    assert.match(change.lastError ?? "", /PORTONE_PAYMENT_CANCELLED/);

    const sweep = await reconcileStaleRequestedBillingPayments({
      staleBefore: new Date(Date.now() + 60_000),
      fetchPayment: async () => {
        throw new Error("CANCELLED_OPERATION_MUST_NOT_BE_RECONCILED");
      },
    });
    assert.deepEqual(sweep, {
      scanned: 0,
      processed: 0,
      retryable: 0,
      failed: 0,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("transient provider failures become retryable and the sweep converges them", async () => {
  const fixture = await createFixture();
  try {
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `retry-${fixture.suffix}`,
      eventType: "Transaction.Paid",
      paymentId: fixture.paymentId,
      payload: { type: "Transaction.Paid", data: { paymentId: fixture.paymentId } },
    });

    const retryable = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => {
        throw new Error("temporary provider outage");
      },
    });
    assert.equal(retryable.status, "RETRYABLE");

    await prisma.billingWebhookEvent.update({
      where: { id: recorded.event.id },
      data: { nextRetryAt: new Date(0) },
    });
    const result = await reconcilePendingBillingWebhookEvents({
      now: new Date(),
      fetchPayment: async () => ({
        id: fixture.paymentId,
        status: "PAID",
        paidAt: "2026-07-21T02:00:00.000Z",
        amount: { total: 1000 },
        currency: "KRW",
      }),
    });

    assert.equal(result.processed, 1);
    assert.equal(
      (await prisma.billingWebhookEvent.findUniqueOrThrow({ where: { id: recorded.event.id } })).status,
      "PROCESSED",
    );
    assert.equal(
      (await prisma.teamBillingHistory.findUniqueOrThrow({ where: { id: fixture.history.id } })).status,
      "SUCCESS",
    );
  } finally {
    await cleanup(fixture);
  }
});

test("stale pending subscription payments reconcile even when no webhook arrived", async () => {
  const fixture = await createFixture();
  const attemptId = randomUUID();
  const targetPlan = getPlan("pro_monthly_v1");
  const billingKey = `stale-payment-key-${fixture.suffix}`;
  await prisma.subscriptionChange.update({
    where: { id: fixture.change.id },
    data: { paymentStatus: "FAILED" },
  });
  fixture.paymentId = createSubscriptionPaymentId(targetPlan.code, attemptId);
  await prisma.teamProductSubscription.update({
    where: { id: fixture.press.id },
    data: { payProvider: "INICIS", billingKey },
  });
  const change = await prisma.subscriptionChange.create({
    data: {
      teamId: fixture.team.id,
      product: "PRESS",
      subscriptionId: fixture.press.id,
      changeType: "RENEW",
      targetPlanId: "pro_monthly_v1",
      idempotencyKey: `subscription-change:${fixture.team.id}:PRESS:${attemptId}`,
      externalPaymentId: fixture.paymentId,
      requesterUserId: fixture.user.id,
      payProvider: "INICIS",
      paymentMethodRef: createProductSubscriptionPaymentMethodRef({
        subscriptionId: fixture.press.id,
        billingKey,
      }),
      paymentStatus: "PENDING",
      applyStatus: "PENDING",
      priceSnapshot: {
        version: 1,
        finalAmount: targetPlan.monthlyAmountWon,
        currency: "KRW",
        targetPlanId: "pro_monthly_v1",
        couponCode: null,
        calculatedAt: new Date().toISOString(),
      },
    },
  });
  await prisma.teamBillingHistory.delete({ where: { id: fixture.history.id } });
  try {
    const result = await reconcileStaleRequestedBillingPayments({
      staleBefore: new Date(Date.now() + 60_000),
      fetchPayment: async () => ({
        id: fixture.paymentId,
        status: "PAID",
        paidAt: "2026-07-21T03:00:00.000Z",
        amount: { total: targetPlan.monthlyAmountWon },
        currency: "KRW",
      }),
    });

    const reconciliationEvent =
      await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { transmissionId: `reconcile:${change.id}` },
      });
    assert.equal(
      reconciliationEvent.status,
      "PROCESSED",
      reconciliationEvent.lastError ?? undefined,
    );
    assert.deepEqual(result, {
      scanned: 1,
      processed: 1,
      retryable: 0,
      failed: 0,
    });
    assert.equal(
      (await prisma.teamBillingHistory.findUniqueOrThrow({
        where: { externalId: fixture.paymentId },
      })).status,
      "SUCCESS",
    );
    assert.equal(
      await prisma.billingWebhookEvent.count({
        where: { transmissionId: `reconcile:${change.id}` },
      }),
      1,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("recent DB-success payments persist a failed audit when the provider disagrees", async () => {
  const fixture = await createFixture();
  const createdAt = new Date("2099-07-21T23:00:00.000Z");
  const now = new Date("2099-07-22T00:00:00.000Z");
  try {
    await prisma.subscriptionChange.update({
      where: { id: fixture.change.id },
      data: {
        paymentStatus: "CONFIRMED",
        paymentConfirmedAt: createdAt,
      },
    });
    await prisma.teamBillingHistory.update({
      where: { id: fixture.history.id },
      data: { status: "SUCCESS", createdAt },
    });

    const result = await auditRecentSuccessfulBillingPayments({
      now,
      since: createdAt,
      maxAttempts: 1,
      fetchPayment: async () => ({
        id: fixture.paymentId,
        status: "FAILED",
      }),
    });

    assert.deepEqual(result, { scanned: 1, confirmed: 0, retryable: 0, failed: 1 });
    const audit = await prisma.billingWebhookEvent.findUniqueOrThrow({
      where: { transmissionId: `audit:2099-07-22:${fixture.history.id}` },
    });
    assert.equal(audit.status, "FAILED");
    assert.equal(audit.lastError, "PROVIDER_DB_STATUS_MISMATCH");
    assert.equal(audit.paymentId, fixture.paymentId);
  } finally {
    await cleanup(fixture);
  }
});

test("duplicate successful attempts persist one idempotent incident", async () => {
  const fixture = await createFixture();
  const attemptId = `attempt-${fixture.suffix}`;
  const secondPaymentId = `payment-duplicate-${fixture.suffix}`;
  const incidentTransmissionId = `duplicate-charge:${fixture.press.id}:${attemptId}`;
  try {
    await prisma.teamBillingHistory.update({
      where: { id: fixture.history.id },
      data: { status: "SUCCESS", meta: { attemptId } },
    });
    const duplicate = await prisma.teamBillingHistory.create({
      data: {
        teamId: fixture.team.id,
        userId: fixture.user.id,
        type: "PAYMENT",
        status: "SUCCESS",
        provider: "INICIS",
        plan: "PRO",
        planId: "pro_monthly_v1",
        product: "PRESS",
        subscriptionId: fixture.press.id,
        amount: 1000,
        externalId: secondPaymentId,
        meta: { attemptId },
      },
    });

    const first = await detectDuplicateSuccessfulBillingAttempts({
      since: new Date(Date.now() - 60_000),
    });
    const second = await detectDuplicateSuccessfulBillingAttempts({
      since: new Date(Date.now() - 60_000),
    });

    assert.equal(first.incidents, 1);
    assert.equal(second.incidents, 1);
    assert.equal(
      await prisma.billingWebhookEvent.count({
        where: { transmissionId: incidentTransmissionId },
      }),
      1,
    );
    const incident = await prisma.billingWebhookEvent.findUniqueOrThrow({
      where: { transmissionId: incidentTransmissionId },
    });
    assert.equal(incident.status, "FAILED");
    assert.equal(incident.lastError, "DUPLICATE_SUCCESSFUL_PAYMENT_ATTEMPT");
    assert.deepEqual(
      new Set((incident.payload as { paymentIds: string[] }).paymentIds),
      new Set([fixture.paymentId, secondPaymentId]),
    );
    assert.ok((incident.payload as { historyIds: string[] }).historyIds.includes(duplicate.id));
  } finally {
    await prisma.billingWebhookEvent.deleteMany({
      where: { transmissionId: incidentTransmissionId },
    });
    await cleanup(fixture);
  }
});

test("provider-paid webhook finishes a persisted subscription change after process death", async () => {
  const suffix = randomUUID();
  const attemptId = randomUUID();
  const billingKey = `webhook-recovery-key-${suffix}`;
  const targetPlan = getPlan("career_basic_v1");
  const paymentId = createSubscriptionPaymentId(targetPlan.code, attemptId);
  const previousStoreId = process.env.PORTONE_STORE_ID;
  const previousChannelKey = process.env.PORTONE_INICIS_BILLING_CHANNEL_KEY;
  process.env.PORTONE_STORE_ID = "store-webhook-recovery-test";
  process.env.PORTONE_INICIS_BILLING_CHANNEL_KEY = "channel-webhook-recovery-test";

  const user = await prisma.user.create({
    data: {
      email: `webhook-recovery-${suffix}@example.com`,
      loginId: `webhook-recovery-${suffix}`,
      label: "user",
    },
  });
  const team = await prisma.team.create({
    data: {
      name: `webhook-recovery-${suffix}`,
      slug: `webhook-recovery-${suffix}`,
      plan: "FREE",
      membershipStatus: "ACTIVE",
    },
  });
  await prisma.teamMember.create({
    data: { teamId: team.id, userId: user.id, role: "OWNER" },
  });
  const subscription = await prisma.teamProductSubscription.create({
    data: {
      teamId: team.id,
      product: "CAREER",
      plan: "FREE",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      billingKey,
      nextPaymentAmount: 0,
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
      externalPaymentId: paymentId,
      requesterUserId: user.id,
      payProvider: "INICIS",
      paymentMethodRef: createProductSubscriptionPaymentMethodRef({
        subscriptionId: subscription.id,
        billingKey,
      }),
      paymentStatus: "PENDING",
      applyStatus: "PENDING",
      priceSnapshot: {
        version: 1,
        finalAmount: targetPlan.monthlyAmountWon,
        currency: "KRW",
        targetPlanId: "career_basic_v1",
        couponCode: null,
        calculatedAt: new Date().toISOString(),
      },
    },
  });

  try {
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `process-death-${suffix}`,
      eventType: "Transaction.Paid",
      paymentId,
      payload: { type: "Transaction.Paid", data: { paymentId } },
    });
    const processed = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: async () => ({
        id: paymentId,
        status: "PAID",
        paidAt: "2026-07-22T08:00:00.000Z",
        amount: { total: targetPlan.monthlyAmountWon },
        currency: "KRW",
      }),
    });

    assert.equal(processed.status, "PROCESSED");
    const [recoveredChange, recoveredSubscription, auditProjection] =
      await Promise.all([
        prisma.subscriptionChange.findUniqueOrThrow({ where: { id: change.id } }),
        prisma.teamProductSubscription.findUniqueOrThrow({
          where: { id: subscription.id },
        }),
        prisma.teamBillingHistory.findUniqueOrThrow({
          where: { externalId: paymentId },
        }),
      ]);
    assert.equal(recoveredChange.paymentStatus, "CONFIRMED");
    assert.equal(recoveredChange.applyStatus, "APPLIED");
    assert.equal(
      recoveredChange.paymentConfirmedAt?.toISOString(),
      "2026-07-22T08:00:00.000Z",
    );
    assert.equal(recoveredSubscription.planId, "career_basic_v1");
    assert.equal(recoveredSubscription.plan, "BASIC");
    assert.equal(auditProjection.status, "SUCCESS");
    assert.equal(auditProjection.subscriptionId, subscription.id);
  } finally {
    await prisma.billingWebhookEvent.deleteMany({ where: { paymentId } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    if (previousStoreId === undefined) delete process.env.PORTONE_STORE_ID;
    else process.env.PORTONE_STORE_ID = previousStoreId;
    if (previousChannelKey === undefined) {
      delete process.env.PORTONE_INICIS_BILLING_CHANNEL_KEY;
    } else {
      process.env.PORTONE_INICIS_BILLING_CHANNEL_KEY = previousChannelKey;
    }
  }
});
