import {
  Prisma,
  type BillingWebhookEvent,
  type BillingWebhookProcessingStatus,
} from "@prisma/client";

import { getPlan, type PlanId } from "@/config/billing/plans";
import { portoneGetV2 } from "@/lib/portone/portoneRestV2";
import { prisma } from "@/lib/prisma";
import { recoverConfirmedSubscriptionChange } from "@/domain/billing/subscription/subscriptionChangeRecovery";
import {
  markSubscriptionChangeCancelled,
  markSubscriptionChangePaymentConfirmed,
  markSubscriptionChangePaymentFailed,
} from "@/domain/billing/subscription/subscriptionChangeRepository";

export type PortonePaymentSnapshot = {
  id: string;
  status: string;
  paidAt?: string | null;
  cancelledAt?: string | null;
  receiptUrl?: string | null;
  amount?: { total?: number | null } | number | null;
  currency?: string | null;
};

export type FetchPortonePayment = (
  paymentId: string,
) => Promise<PortonePaymentSnapshot>;

export const fetchPortonePaymentSnapshot: FetchPortonePayment = async (paymentId) => {
  const response = await portoneGetV2<PortonePaymentSnapshot>(
    `/payments/${encodeURIComponent(paymentId)}`,
  );
  if (!response.ok) throw new Error(response.error);
  return response.data;
};

type ProcessOptions = {
  fetchPayment: FetchPortonePayment;
  now?: Date;
  maxAttempts?: number;
};

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function cancelFailedOperationCouponReservation(
  tx: Prisma.TransactionClient,
  change: {
    teamId: string;
    requesterUserId: string | null;
    idempotencyKey: string;
    priceSnapshot: Prisma.JsonValue;
  },
) {
  const snapshot = asRecord(change.priceSnapshot);
  const couponCode = optionalString(snapshot.couponCode);
  if (!couponCode || !change.requesterUserId) return;
  const coupon = await tx.coupon.findUnique({
    where: { code: couponCode },
    select: { id: true },
  });
  if (!coupon) return;
  const redemption = await tx.couponRedemption.findUnique({
    where: {
      couponId_userId: {
        couponId: coupon.id,
        userId: change.requesterUserId,
      },
    },
  });
  if (!redemption || redemption.status !== "APPLIED") return;
  const meta = asRecord(redemption.meta);
  const attemptId = change.idempotencyKey.split(":").at(-1);
  if (
    !attemptId ||
    redemption.teamId !== change.teamId ||
    meta.attemptId !== attemptId
  ) {
    return;
  }
  await tx.couponRedemption.update({
    where: { id: redemption.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
}

function retryDelayMs(attempts: number) {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

async function markRetryable(
  eventId: string,
  error: unknown,
  now: Date,
  maxAttempts: number,
) {
  const current = await prisma.billingWebhookEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { attempts: true },
  });
  const terminal = current.attempts >= maxAttempts;
  return prisma.billingWebhookEvent.update({
    where: { id: eventId },
    data: {
      status: terminal ? "FAILED" : "RETRYABLE",
      lastError: errorMessage(error).slice(0, 1000),
      nextRetryAt: terminal
        ? null
        : new Date(now.getTime() + retryDelayMs(current.attempts)),
      lockedAt: null,
    },
  });
}

export async function recordVerifiedPortoneWebhook(args: {
  transmissionId: string;
  eventType: string;
  paymentId?: string | null;
  payload: Prisma.InputJsonValue;
  eventOccurredAt?: Date | null;
}) {
  if (!args.transmissionId.trim()) throw new Error("WEBHOOK_TRANSMISSION_ID_REQUIRED");
  try {
    const event = await prisma.billingWebhookEvent.create({
      data: {
        provider: "PORTONE",
        transmissionId: args.transmissionId,
        eventType: args.eventType,
        paymentId: args.paymentId ?? null,
        payload: args.payload,
        eventOccurredAt: args.eventOccurredAt ?? null,
      },
    });
    return { event, duplicate: false } as const;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const event = await prisma.billingWebhookEvent.findUniqueOrThrow({
      where: { transmissionId: args.transmissionId },
    });
    return { event, duplicate: true } as const;
  }
}

async function reconcilePayment(
  event: BillingWebhookEvent,
  payment: PortonePaymentSnapshot,
  now: Date,
) {
  if (payment.id !== event.paymentId) {
    throw new Error("PORTONE_PAYMENT_ID_MISMATCH");
  }

  const normalizedStatus = payment.status.trim().toUpperCase();
  if (!["PAID", "FAILED", "CANCELLED", "PARTIAL_CANCELLED"].includes(normalizedStatus)) {
    throw new Error(`PORTONE_PAYMENT_NOT_TERMINAL:${normalizedStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    const subscriptionChange = await tx.subscriptionChange.findUnique({
      where: { externalPaymentId: payment.id },
    });
    if (!subscriptionChange) {
      throw new Error("LOCAL_PAYMENT_OPERATION_NOT_FOUND");
    }
    const history = await tx.teamBillingHistory.findUnique({
      where: { externalId: payment.id },
    });
    const teamId = subscriptionChange.teamId;
    const product = subscriptionChange.product;
    const subscriptionId = subscriptionChange.subscriptionId;
    if (!subscriptionId) {
      throw new Error("LOCAL_PAYMENT_OPERATION_IDENTITY_MISMATCH");
    }
    const subscription = await tx.teamProductSubscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, teamId: true, product: true, plan: true, planId: true },
    });
    if (
      !subscription ||
      subscription.teamId !== teamId ||
      subscription.product !== product
    ) {
      throw new Error("LOCAL_PAYMENT_SUBSCRIPTION_MISMATCH");
    }

    const snapshot = asRecord(subscriptionChange.priceSnapshot);
    const snapshotAmount = snapshot.finalAmount;
    if (typeof snapshotAmount !== "number" || !Number.isFinite(snapshotAmount)) {
      throw new Error("LOCAL_PAYMENT_PRICE_SNAPSHOT_INVALID");
    }
    const amount = snapshotAmount;
    const snapshotCurrency = optionalString(snapshot.currency);
    if (!snapshotCurrency) {
      throw new Error("LOCAL_PAYMENT_PRICE_SNAPSHOT_INVALID");
    }
    if (normalizedStatus === "PAID") {
      const providerAmount =
        typeof payment.amount === "number"
          ? payment.amount
          : payment.amount?.total;
      if (providerAmount !== amount) {
        throw new Error("PROVIDER_PAYMENT_AMOUNT_MISMATCH");
      }
      if (payment.currency?.trim().toUpperCase() !== snapshotCurrency.toUpperCase()) {
        throw new Error("PROVIDER_PAYMENT_CURRENCY_MISMATCH");
      }
    }
    const planId = subscriptionChange.targetPlanId;
    const plan = getPlan(subscriptionChange.targetPlanId as PlanId).planType;
    const provider = subscriptionChange.payProvider;
    const userId = subscriptionChange.requesterUserId;
    const paidAt = parseDate(payment.paidAt) ?? subscriptionChange.createdAt;
    const cancelledAt = parseDate(payment.cancelledAt) ?? now;
    const projectionBase = {
      teamId,
      userId,
      type: "PAYMENT" as const,
      provider,
      plan,
      planId,
      product,
      subscriptionId,
      afterPlanId: planId,
      amount,
      currency: snapshotCurrency,
    };

    if (normalizedStatus === "PAID") {
      if (subscriptionChange.paymentStatus === "PENDING") {
        await markSubscriptionChangePaymentConfirmed({
          id: subscriptionChange.id,
          externalPaymentId: payment.id,
          paymentConfirmedAt: paidAt,
          client: tx,
        });
      }
      await tx.teamBillingHistory.upsert({
        where: { externalId: payment.id },
        create: {
          ...projectionBase,
          status: "SUCCESS",
          externalId: payment.id,
          receiptUrl: payment.receiptUrl ?? null,
          occurredAt: paidAt,
          meta: {
            kind: "SUBSCRIPTION_PAYMENT",
            subscriptionChangeId: subscriptionChange.id,
            providerStatus: normalizedStatus,
          },
        },
        update: {
          ...projectionBase,
          status: "SUCCESS",
          occurredAt: paidAt,
          receiptUrl: payment.receiptUrl ?? history?.receiptUrl ?? null,
        },
      });
      await tx.teamProductSubscription.update({
        where: { id: subscription.id },
        data: {
          lastPaymentId: payment.id,
          lastPaidAt: paidAt,
        },
      });
    } else if (normalizedStatus === "FAILED") {
      if (subscriptionChange.paymentStatus === "CONFIRMED") {
        throw new Error("PROVIDER_DB_STATUS_MISMATCH");
      }
      if (subscriptionChange.paymentStatus === "PENDING") {
        await markSubscriptionChangePaymentFailed({
          id: subscriptionChange.id,
          error: "PORTONE_PAYMENT_FAILED",
          client: tx,
        });
        await cancelFailedOperationCouponReservation(tx, subscriptionChange);
      }
      await tx.teamBillingHistory.upsert({
        where: { externalId: payment.id },
        create: {
          ...projectionBase,
          status: "FAILED",
          externalId: payment.id,
          occurredAt: now,
          meta: {
            kind: "SUBSCRIPTION_PAYMENT",
            subscriptionChangeId: subscriptionChange.id,
            providerStatus: normalizedStatus,
          },
        },
        update: {
          ...projectionBase,
          status: "FAILED",
          occurredAt: now,
        },
      });
    } else {
      if (["PENDING", "FAILED"].includes(subscriptionChange.applyStatus)) {
        await markSubscriptionChangeCancelled({
          id: subscriptionChange.id,
          error: "PORTONE_PAYMENT_CANCELLED",
          client: tx,
        });
      }
      await tx.teamBillingHistory.upsert({
        where: { externalId: `portone-cancel:${payment.id}` },
        create: {
          teamId,
          userId,
          type: "REFUND",
          status: "SUCCESS",
          provider,
          plan,
          planId,
          product,
          subscriptionId,
          beforePlanId: planId,
          afterPlanId: planId,
          amount: amount == null ? null : -Math.abs(amount),
          currency: snapshotCurrency,
          externalId: `portone-cancel:${payment.id}`,
          occurredAt: cancelledAt,
          meta: {
            kind: "PORTONE_PAYMENT_CANCELLATION",
            paymentId: payment.id,
            subscriptionChangeId: subscriptionChange.id,
            providerStatus: normalizedStatus,
          },
        },
        update: {
          occurredAt: cancelledAt,
          meta: {
            kind: "PORTONE_PAYMENT_CANCELLATION",
            paymentId: payment.id,
            subscriptionChangeId: subscriptionChange.id,
            providerStatus: normalizedStatus,
          },
        },
      });
    }

    const updatedEvent = await tx.billingWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        teamId,
        product,
        subscriptionId,
        eventOccurredAt:
          normalizedStatus === "PAID"
            ? paidAt
            : normalizedStatus === "FAILED"
              ? now
              : cancelledAt,
        processedAt: now,
        nextRetryAt: null,
        lastError: null,
        lockedAt: null,
      },
    });
    return {
      event: updatedEvent,
      recoverChangeId:
        normalizedStatus === "PAID" &&
        subscriptionChange &&
        ["PENDING", "FAILED"].includes(subscriptionChange.applyStatus)
          ? subscriptionChange.id
          : null,
    };
  });
}

export async function processBillingWebhookEvent(
  eventId: string,
  options: ProcessOptions,
) {
  const now = options.now ?? new Date();
  const maxAttempts = options.maxAttempts ?? 8;
  const staleLockBefore = new Date(now.getTime() - 5 * 60_000);

  const claimed = await prisma.billingWebhookEvent.updateMany({
    where: {
      id: eventId,
      OR: [
        { status: "RECEIVED" },
        {
          status: "RETRYABLE",
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        { status: "PROCESSING", lockedAt: { lt: staleLockBefore } },
      ],
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lockedAt: now,
      lastError: null,
    },
  });

  if (claimed.count === 0) {
    return prisma.billingWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  }

  const event = await prisma.billingWebhookEvent.findUniqueOrThrow({
    where: { id: eventId },
  });
  if (!event.paymentId) {
    return prisma.billingWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "IGNORED",
        processedAt: now,
        lockedAt: null,
        lastError: null,
      },
    });
  }

  try {
    const payment = await options.fetchPayment(event.paymentId);
    const reconciled = await reconcilePayment(event, payment, now);
    if (reconciled.recoverChangeId) {
      await recoverConfirmedSubscriptionChange({
        changeId: reconciled.recoverChangeId,
      });
    }
    return reconciled.event;
  } catch (error) {
    return markRetryable(event.id, error, now, maxAttempts);
  }
}

export async function reconcilePendingBillingWebhookEvents(args: {
  fetchPayment: FetchPortonePayment;
  now?: Date;
  take?: number;
  maxAttempts?: number;
}) {
  const now = args.now ?? new Date();
  const take = Math.max(1, Math.min(args.take ?? 100, 500));
  const events = await prisma.billingWebhookEvent.findMany({
    where: {
      OR: [
        { status: "RECEIVED" },
        {
          status: "RETRYABLE",
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        {
          status: "PROCESSING",
          lockedAt: { lt: new Date(now.getTime() - 5 * 60_000) },
        },
      ],
    },
    orderBy: { receivedAt: "asc" },
    take,
    select: { id: true },
  });

  const counts: Record<BillingWebhookProcessingStatus, number> = {
    RECEIVED: 0,
    PROCESSING: 0,
    PROCESSED: 0,
    FAILED: 0,
    RETRYABLE: 0,
    IGNORED: 0,
  };
  for (const event of events) {
    const result = await processBillingWebhookEvent(event.id, {
      fetchPayment: args.fetchPayment,
      now,
      maxAttempts: args.maxAttempts,
    });
    counts[result.status] += 1;
  }

  return {
    scanned: events.length,
    processed: counts.PROCESSED,
    retryable: counts.RETRYABLE,
    failed: counts.FAILED,
    ignored: counts.IGNORED,
  };
}

export async function reconcileStaleRequestedBillingPayments(args: {
  fetchPayment: FetchPortonePayment;
  now?: Date;
  staleBefore?: Date;
  take?: number;
  maxAttempts?: number;
}) {
  const now = args.now ?? new Date();
  const staleBefore = args.staleBefore ?? new Date(now.getTime() - 5 * 60_000);
  const take = Math.max(1, Math.min(args.take ?? 100, 500));
  const changes = await prisma.subscriptionChange.findMany({
    where: {
      paymentStatus: "PENDING",
      applyStatus: { in: ["PENDING", "FAILED"] },
      externalPaymentId: { not: null },
      subscriptionId: { not: null },
      requesterUserId: { not: null },
      createdAt: { lte: staleBefore },
    },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      externalPaymentId: true,
      createdAt: true,
    },
  });

  let processed = 0;
  let retryable = 0;
  let failed = 0;
  for (const change of changes) {
    const paymentId = change.externalPaymentId;
    if (!paymentId) continue;
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `reconcile:${change.id}`,
      eventType: "Reconciliation.PendingSubscriptionPayment",
      paymentId,
      payload: {
        kind: "PENDING_SUBSCRIPTION_PAYMENT_RECONCILIATION",
        subscriptionChangeId: change.id,
        paymentId,
        requestedAt: change.createdAt.toISOString(),
      },
    });
    const result = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: args.fetchPayment,
      now,
      maxAttempts: args.maxAttempts,
    });
    if (result.status === "PROCESSED") processed += 1;
    else if (result.status === "RETRYABLE") retryable += 1;
    else if (result.status === "FAILED") failed += 1;
  }

  return { scanned: changes.length, processed, retryable, failed };
}

export async function auditRecentSuccessfulBillingPayments(args: {
  fetchPayment: FetchPortonePayment;
  now?: Date;
  since?: Date;
  take?: number;
  maxAttempts?: number;
}) {
  const now = args.now ?? new Date();
  const since = args.since ?? new Date(now.getTime() - 24 * 60 * 60_000);
  const take = Math.max(1, Math.min(args.take ?? 100, 500));
  const histories = await prisma.teamBillingHistory.findMany({
    where: {
      status: "SUCCESS",
      type: "PAYMENT",
      externalId: { not: null },
      product: { not: null },
      subscriptionId: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, externalId: true },
  });
  const auditDay = now.toISOString().slice(0, 10);
  let confirmed = 0;
  let retryable = 0;
  let failed = 0;
  for (const history of histories) {
    if (!history.externalId) continue;
    const recorded = await recordVerifiedPortoneWebhook({
      transmissionId: `audit:${auditDay}:${history.id}`,
      eventType: "Reconciliation.SuccessAudit",
      paymentId: history.externalId,
      payload: {
        kind: "SUCCESS_PAYMENT_PROVIDER_AUDIT",
        historyId: history.id,
        paymentId: history.externalId,
        auditDay,
      },
    });
    const result = await processBillingWebhookEvent(recorded.event.id, {
      fetchPayment: args.fetchPayment,
      now,
      maxAttempts: args.maxAttempts,
    });
    if (result.status === "PROCESSED") confirmed += 1;
    else if (result.status === "RETRYABLE") retryable += 1;
    else if (result.status === "FAILED") failed += 1;
  }
  return { scanned: histories.length, confirmed, retryable, failed };
}

export async function detectDuplicateSuccessfulBillingAttempts(args?: {
  since?: Date;
  take?: number;
}) {
  const take = Math.max(1, Math.min(args?.take ?? 1000, 5000));
  const histories = await prisma.teamBillingHistory.findMany({
    where: {
      status: "SUCCESS",
      type: "PAYMENT",
      subscriptionId: { not: null },
      externalId: { not: null },
      ...(args?.since ? { createdAt: { gte: args.since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      teamId: true,
      product: true,
      subscriptionId: true,
      externalId: true,
      meta: true,
    },
  });

  const groups = new Map<string, typeof histories>();
  for (const history of histories) {
    const meta = asRecord(history.meta);
    const attemptId = optionalString(meta.attemptId);
    if (!attemptId || !history.subscriptionId) continue;
    const key = `${history.subscriptionId}:${attemptId}`;
    const group = groups.get(key) ?? [];
    group.push(history);
    groups.set(key, group);
  }

  let incidents = 0;
  for (const [key, group] of groups) {
    const paymentIds = [...new Set(group.map((item) => item.externalId).filter(Boolean))];
    if (paymentIds.length < 2) continue;
    const sample = group[0];
    const transmissionId = `duplicate-charge:${key}`;
    await prisma.billingWebhookEvent.upsert({
      where: { transmissionId },
      create: {
        provider: "PORTONE",
        transmissionId,
        eventType: "Reconciliation.DuplicateChargeDetected",
        status: "FAILED",
        attempts: 1,
        lastError: "DUPLICATE_SUCCESSFUL_PAYMENT_ATTEMPT",
        processedAt: new Date(),
        teamId: sample.teamId,
        product: sample.product,
        subscriptionId: sample.subscriptionId,
        payload: {
          kind: "DUPLICATE_SUCCESSFUL_PAYMENT_ATTEMPT",
          historyIds: group.map((item) => item.id),
          paymentIds,
        },
      },
      update: {
        lastError: "DUPLICATE_SUCCESSFUL_PAYMENT_ATTEMPT",
        processedAt: new Date(),
        payload: {
          kind: "DUPLICATE_SUCCESSFUL_PAYMENT_ATTEMPT",
          historyIds: group.map((item) => item.id),
          paymentIds,
        },
      },
    });
    incidents += 1;
  }
  return { scanned: histories.length, incidents };
}
