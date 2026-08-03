import type { PayProvider } from "@/config/billing/options";
import { getPlan, type PlanId } from "@/config/billing/plans";
import { prisma } from "@/lib/prisma";
import { completeWithBillingKey } from "./completeWithBillingKey";
import { matchesProductSubscriptionPaymentMethodRef } from "./paymentMethodReference";
import { recoverConfirmedSubscriptionChange } from "./subscriptionChangeRecovery";

export async function reconcileConfirmedSubscriptionChanges(args?: {
  now?: Date;
  take?: number;
}) {
  const now = args?.now ?? new Date();
  const take = Math.max(1, Math.min(args?.take ?? 100, 500));
  const changes = await prisma.subscriptionChange.findMany({
    where: {
      paymentStatus: { in: ["CONFIRMED", "NOT_REQUIRED"] },
      applyStatus: { in: ["PENDING", "FAILED"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true },
  });

  let applied = 0;
  let failed = 0;
  for (const change of changes) {
    try {
      await recoverConfirmedSubscriptionChange({ changeId: change.id, now });
      applied += 1;
    } catch {
      failed += 1;
    }
  }

  return { scanned: changes.length, applied, failed };
}

type PendingSubscriptionChangeRecovery = (args: {
  changeId: string;
  now: Date;
}) => Promise<unknown>;

function persistedPayProvider(provider: "INICIS" | "KAKAOPAY"): PayProvider {
  return provider === "INICIS" ? "inicis" : "kakaopay";
}

function persistedPriceSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SUBSCRIPTION_CHANGE_PRICE_SNAPSHOT_INVALID");
  }
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.finalAmount !== "number" ||
    !Number.isInteger(snapshot.finalAmount) ||
    snapshot.finalAmount < 0
  ) {
    throw new Error("SUBSCRIPTION_CHANGE_PRICE_SNAPSHOT_INVALID");
  }
  const couponCode =
    typeof snapshot.couponCode === "string" && snapshot.couponCode.trim()
      ? snapshot.couponCode.trim()
      : null;
  return { finalAmount: snapshot.finalAmount, couponCode };
}

export async function resumeStalePendingSubscriptionChange(args: {
  changeId: string;
  now?: Date;
  complete?: (
    input: Parameters<typeof completeWithBillingKey>[0],
  ) => Promise<unknown>;
}) {
  const now = args.now ?? new Date();
  const change = await prisma.subscriptionChange.findUnique({
    where: { id: args.changeId },
  });
  if (!change) throw new Error("SUBSCRIPTION_CHANGE_NOT_FOUND");
  if (
    change.paymentStatus !== "PENDING" ||
    change.applyStatus !== "PENDING" ||
    change.createdAt.getTime() > now.getTime() - 5 * 60_000
  ) {
    throw new Error("SUBSCRIPTION_CHANGE_NOT_STALE_PENDING");
  }
  if (
    !change.subscriptionId ||
    !change.requesterUserId ||
    !change.payProvider ||
    !change.paymentMethodRef ||
    !change.externalPaymentId
  ) {
    throw new Error("SUBSCRIPTION_CHANGE_REPLAY_IDENTITY_INCOMPLETE");
  }

  const subscription = await prisma.teamProductSubscription.findUnique({
    where: { id: change.subscriptionId },
  });
  if (
    !subscription ||
    subscription.teamId !== change.teamId ||
    subscription.product !== change.product ||
    !subscription.billingKey ||
    subscription.payProvider !== change.payProvider ||
    !matchesProductSubscriptionPaymentMethodRef({
      reference: change.paymentMethodRef,
      subscriptionId: subscription.id,
      billingKey: subscription.billingKey,
    })
  ) {
    throw new Error("SUBSCRIPTION_PAYMENT_METHOD_REFERENCE_INVALID");
  }

  const idempotencyPrefix =
    `subscription-change:${change.teamId}:${change.product}:`;
  if (!change.idempotencyKey.startsWith(idempotencyPrefix)) {
    throw new Error("SUBSCRIPTION_CHANGE_IDEMPOTENCY_CONFLICT");
  }
  const attemptId = change.idempotencyKey.slice(idempotencyPrefix.length);
  if (!attemptId || attemptId.includes(":")) {
    throw new Error("SUBSCRIPTION_CHANGE_IDEMPOTENCY_CONFLICT");
  }

  const target = getPlan(change.targetPlanId as PlanId);
  const snapshot = persistedPriceSnapshot(change.priceSnapshot);
  return (args.complete ?? completeWithBillingKey)({
    teamId: change.teamId,
    userId: change.requesterUserId,
    planId: target.id,
    payProvider: persistedPayProvider(change.payProvider),
    billingKey: subscription.billingKey,
    attemptId,
    couponCode: snapshot.couponCode,
    recovery: {
      changeId: change.id,
      changeType: change.changeType,
      finalAmount: snapshot.finalAmount,
      couponCode: snapshot.couponCode,
      paymentMethodRef: change.paymentMethodRef,
      paymentExternalId: change.externalPaymentId,
      pastDueRecovery: change.externalPaymentId.startsWith("br_"),
    },
  });
}

export async function reconcileStalePendingSubscriptionChanges(args?: {
  now?: Date;
  take?: number;
  recover?: PendingSubscriptionChangeRecovery;
}) {
  const now = args?.now ?? new Date();
  const take = Math.max(1, Math.min(args?.take ?? 100, 500));
  const recover = args?.recover ?? resumeStalePendingSubscriptionChange;
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  const changes = await prisma.subscriptionChange.findMany({
    where: {
      paymentStatus: "PENDING",
      applyStatus: "PENDING",
      createdAt: { lte: staleBefore },
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true },
  });

  let resumed = 0;
  let failed = 0;
  for (const change of changes) {
    try {
      await recover({ changeId: change.id, now });
      resumed += 1;
    } catch {
      failed += 1;
    }
  }

  return { scanned: changes.length, resumed, failed };
}
