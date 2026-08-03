// src/domain/billing/subscription/completeWithBillingKey.ts

import type { PlanId } from "@/config/billing/plans";
import { getPlan } from "@/config/billing/plans";
import type { PayProvider } from "@/config/billing/options";
import {
  getPortOneStoreId,
  resolvePortOneChannel,
} from "@/config/billing/portone.server";
import { portonePostV2 } from "@/lib/portone/portoneRestV2";
import { prisma } from "@/lib/prisma";
import { Prisma, type PlanType, type ProductLine, type SubscriptionPayProvider } from "@prisma/client";
import {
  planTier,
} from "@/domain/billing/teamMembership";
import {
  buildCheckoutSubscriptionPatch,
  buildImmediateUpgradePatch,
  buildRecurringRenewalPatch,
  buildScheduledDowngradePatch,
} from "@/domain/billing/subscription/lifecycle";
import {
  computeDiscount,
  isDiscountCoupon,
  validateCouponForPlan,
} from "@/lib/services/couponService";
import { iso, ymdhm, withoutBillingKey } from "@/domain/billing/subscription/serialize";
import {
  serializeCompletionTeam,
  TEAM_COMPLETION_SELECT,
} from "@/domain/billing/subscription/completionPresentation";
import { resolveSubscriptionPricing } from "@/domain/billing/subscription/pricing";
import {
  getEffectiveProductSubscription,
  getLockedProductSubscriptionSnapshot,
  persistLegacyProductSubscription,
  requireProductForPlan,
  upsertProductSubscriptionFromLegacyTeam,
  upsertProductSubscriptionSnapshot,
} from "@/domain/billing/productSubscription";
import { logTeamBillingHistory } from "@/domain/billing/history/log";
import {
  confirmSubscriptionPayment,
  createSubscriptionPaymentId,
  isDefinitiveSubscriptionPaymentFailure,
  normalizeSubscriptionProvider,
  type BillingCustomerInput,
  type BillingPortOneDeps,
} from "@/domain/billing/subscription/paymentConfirmation";
import {
  markSubscriptionChangeApplied,
  markSubscriptionChangeApplyFailed,
  markSubscriptionChangePaymentConfirmed,
  markSubscriptionChangePaymentFailed,
  prepareSubscriptionChangeWithPaymentMethod,
  recordSubscriptionChangePaymentUncertain,
} from "@/domain/billing/subscription/subscriptionChangeRepository";
import { createProductSubscriptionPaymentMethodRef } from "@/domain/billing/subscription/paymentMethodReference";
import { lockSubscriptionChangeApply } from "@/domain/billing/subscription/subscriptionChangeApplyLock";

function err(status: number, message: string) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}


type CompleteAction =
  | "SUBSCRIBED"
  | "SUBSCRIBED_NO_CHARGE"
  | "RENEWED"
  | "UPGRADED"
  | "UPGRADED_NO_PRORATION"
  | "DOWNGRADE_SCHEDULED"
  | "CHANGE_SCHEDULED"
  | "NO_CHANGE";

const TEAM_RETURN_SELECT = TEAM_COMPLETION_SELECT;

function errorReason(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return "SUBSCRIPTION_PAYMENT_FAILED";
}

async function ensurePaymentAttemptAuditProjection(args: {
  teamId: string;
  userId: string;
  provider: SubscriptionPayProvider;
  plan: PlanType;
  planId: PlanId;
  product: ProductLine;
  subscriptionId: string;
  externalId: string;
  attemptId: string;
  amount: number;
  pastDueRecovery?: boolean;
}) {
  return prisma.teamBillingHistory.upsert({
    where: { externalId: args.externalId },
    create: {
      teamId: args.teamId,
      userId: args.userId,
      type: "PAYMENT",
      status: "REQUESTED",
      provider: args.provider,
      plan: args.plan,
      planId: args.planId,
      product: args.product,
      subscriptionId: args.subscriptionId,
      afterPlanId: args.planId,
      amount: args.amount,
      currency: "KRW",
      externalId: args.externalId,
      meta: args.pastDueRecovery
        ? {
            kind: "SUBSCRIPTION_PAST_DUE_RECOVERY_ATTEMPT",
            paymentId: args.externalId,
            targetPlanId: args.planId,
            payNowAmountWon: args.amount,
            product: args.product,
            subscriptionId: args.subscriptionId,
          }
        : {
            kind: "SUBSCRIPTION_PAYMENT_ATTEMPT",
            attemptId: args.attemptId,
            payNowAmountWon: args.amount,
            product: args.product,
            subscriptionId: args.subscriptionId,
          },
    },
    update: {
      teamId: args.teamId,
      userId: args.userId,
      provider: args.provider,
      plan: args.plan,
      planId: args.planId,
      product: args.product,
      subscriptionId: args.subscriptionId,
      afterPlanId: args.planId,
      amount: args.amount,
      currency: "KRW",
    },
    select: { id: true },
  });
}

async function markPaymentAttemptFailed(args: {
  historyId: string;
  error: unknown;
  product: ProductLine;
  subscriptionId: string;
  pastDueRecovery?: boolean;
}) {
  await prisma.teamBillingHistory.updateMany({
    where: { id: args.historyId, status: "REQUESTED" },
    data: {
      status: "FAILED",
      meta: {
        kind: args.pastDueRecovery
          ? "SUBSCRIPTION_PAST_DUE_RECOVERY_ATTEMPT"
          : "SUBSCRIPTION_PAYMENT_ATTEMPT",
        status: "FAILED",
        reason: errorReason(args.error).slice(0, 500),
        failedAt: new Date().toISOString(),
        product: args.product,
        subscriptionId: args.subscriptionId,
      },
    },
  });
}

async function markPaymentAttemptSucceeded(
  tx: Prisma.TransactionClient,
  args: {
    historyId: string;
    teamId: string;
    userId: string;
    provider: SubscriptionPayProvider | null;
    plan: PlanType | null;
    planId: string | null;
    amount: number;
    action: CompleteAction;
    paidAt: Date | null;
    paidMeta: any;
    product: ProductLine;
    subscriptionId: string;
    pastDueRecovery?: boolean;
  },
) {
  await tx.teamBillingHistory.update({
    where: { id: args.historyId },
    data: {
      teamId: args.teamId,
      userId: args.userId,
      type: "PAYMENT",
      status: "SUCCESS",
      provider: args.provider,
      plan: args.plan,
      planId: args.planId,
      amount: args.amount,
      currency: "KRW",
      ...(args.paidMeta?.receiptUrl
        ? { receiptUrl: args.paidMeta.receiptUrl }
        : {}),
      meta: {
        kind: args.pastDueRecovery
          ? "SUBSCRIPTION_PAST_DUE_RECOVERY"
          : "SUBSCRIPTION_PAYMENT",
        action: args.pastDueRecovery ? "PAST_DUE_RECOVERED" : args.action,
        product: args.product,
        subscriptionId: args.subscriptionId,
        payNowAmountWon: args.amount,
        paidAt: args.paidAt?.toISOString() ?? null,
        portone: args.paidMeta ?? null,
      },
      occurredAt: args.paidAt ?? new Date(),
    },
  });
}

export async function completeWithBillingKey(args: {
  teamId: string;
  userId: string;
  planId: PlanId;
  payProvider: PayProvider;
  billingKey: string;
  customer?: BillingCustomerInput;
  attemptId: string; // UUID
  couponCode?: string | null;
  portone?: BillingPortOneDeps;
  recordApplyFailure?: boolean;
  initialPriceSnapshot?: {
    changeType: "RENEW";
    finalAmount: number;
    pastDueRecovery?: boolean;
    paymentExternalId?: string;
  };
  recovery?: {
    changeId: string;
    changeType: string;
    finalAmount: number;
    couponCode: string | null;
    paymentMethodRef: string;
    paymentExternalId: string;
    pastDueRecovery: boolean;
  };
}): Promise<{
  action: CompleteAction;
  mode: string;
  payNowAmountWon: number;
  prorationWon?: number;
  team: any;
  note: string;
}> {
  const billingKey = args.billingKey?.trim();
  if (!billingKey && !args.recovery) throw err(400, "MISSING_BILLING_KEY");

  const team = await prisma.team.findUnique({
    where: { id: args.teamId },
    select: {
      id: true,
      slug: true,
      name: true,

      plan: true,
      planId: true,
      membershipStatus: true,

      payProvider: true,
      billingKey: true,

      planExpiresAt: true,
      nextBillingAt: true,

      pendingPlan: true,
      pendingPlanId: true,
      pendingPlanStartsAt: true,

      cancelRequestedAt: true,

      lastPaymentId: true,
      lastPaidAt: true,
    },
  });
  if (!team) throw err(404, "TEAM_NOT_FOUND");

  const target = getPlan(args.planId);
  const product = requireProductForPlan(args.planId);
  await persistLegacyProductSubscription(team.id);
  const currentSubscription = await getEffectiveProductSubscription(
    team.id,
    product,
  );
  const subscriptionIdentity = await upsertProductSubscriptionSnapshot(
    currentSubscription,
  );
  const targetPlanType = target.planType as PlanType;

  const currentPlanType = currentSubscription.plan as PlanType;
  const tierNow = planTier(currentPlanType);
  const tierTarget = planTier(targetPlanType);

  const recoveryCoupon = args.recovery?.couponCode
    ? await prisma.coupon.findUnique({
        where: { code: args.recovery.couponCode },
      })
    : null;
  if (args.recovery?.couponCode && !recoveryCoupon) {
    throw err(409, "SUBSCRIPTION_CHANGE_COUPON_NOT_FOUND");
  }
  const recoveryCouponRedemption = recoveryCoupon
    ? await prisma.couponRedemption.findUnique({
        where: {
          couponId_userId: {
            couponId: recoveryCoupon.id,
            userId: args.userId,
          },
        },
      })
    : null;
  if (recoveryCouponRedemption) {
    const meta =
      recoveryCouponRedemption.meta &&
      typeof recoveryCouponRedemption.meta === "object" &&
      !Array.isArray(recoveryCouponRedemption.meta)
        ? (recoveryCouponRedemption.meta as Record<string, unknown>)
        : {};
    if (
      recoveryCouponRedemption.teamId !== team.id ||
      meta.attemptId !== args.attemptId ||
      !["APPLIED", "REDEEMED"].includes(recoveryCouponRedemption.status)
    ) {
      throw err(409, "SUBSCRIPTION_CHANGE_COUPON_EVIDENCE_INVALID");
    }
  }

  const now = new Date();
  const currentExpiresAtExclusive = currentSubscription.planExpiresAt ?? null;

  const hasActiveCycle =
    !!currentExpiresAtExclusive &&
    now.getTime() < currentExpiresAtExclusive.getTime();
  const pricing =
    args.recovery && (!args.recovery.couponCode || recoveryCouponRedemption)
      ? {
          action: args.recovery.changeType,
          payNowAmountWon: args.recovery.finalAmount,
          couponPayload:
            recoveryCoupon && recoveryCouponRedemption
              ? {
                  couponId: recoveryCoupon.id,
                  code: recoveryCoupon.code,
                  discountAmount: recoveryCouponRedemption.discountAmount,
                  benefitType: recoveryCoupon.benefitType,
                }
              : null,
        }
      : args.initialPriceSnapshot
        ? {
            action: args.initialPriceSnapshot.changeType,
            payNowAmountWon: args.initialPriceSnapshot.finalAmount,
            couponPayload: null,
          }
        : await resolveSubscriptionPricing({
          targetPlanId: args.planId,
          userId: args.userId,
          couponCode: args.couponCode,
          now,
          current: {
            planId: currentSubscription.planId,
            plan: currentPlanType,
            membershipStatus: currentSubscription.membershipStatus,
            planExpiresAt: currentSubscription.planExpiresAt,
            pendingPlan: currentSubscription.pendingPlan,
            pendingPlanStartsAt: currentSubscription.pendingPlanStartsAt,
            cancelRequestedAt: currentSubscription.cancelRequestedAt,
          },
        });
  const providerEnum = normalizeSubscriptionProvider(args.payProvider);
  const paymentMethodRef =
    args.recovery?.paymentMethodRef ??
    createProductSubscriptionPaymentMethodRef({
      subscriptionId: subscriptionIdentity.id,
      billingKey: billingKey!,
    });

  // --------------------------------------------------------------------------
  // 1. 다운그레이드/동일 tier SKU 전환 예약 처리
  // --------------------------------------------------------------------------
  if (
    (pricing.action === "SCHEDULE_DOWNGRADE" ||
      pricing.action === "SCHEDULE_CHANGE") &&
    hasActiveCycle &&
    currentExpiresAtExclusive
  ) {
    if (
      currentSubscription.membershipStatus === "CANCELED" ||
      currentSubscription.cancelRequestedAt
    ) {
      throw err(409, "CANCELED_MUST_UNCANCEL_FIRST");
    }

    const scheduledExternalId = `nocharge_${args.attemptId}`;
    const scheduledChange = args.recovery
      ? await prisma.subscriptionChange
          .findUniqueOrThrow({ where: { id: args.recovery.changeId } })
          .then((change) => {
            if (
              change.teamId !== team.id ||
              change.product !== product ||
              change.subscriptionId !== subscriptionIdentity.id ||
              change.targetPlanId !== args.planId ||
              change.requesterUserId !== args.userId ||
              change.changeType !== pricing.action
            ) {
              throw err(409, "SUBSCRIPTION_CHANGE_REPLAY_IDENTITY_MISMATCH");
            }
            return { ...change, wasCreated: false as const };
          })
      : await prepareSubscriptionChangeWithPaymentMethod({
          teamId: team.id,
          product,
          subscriptionId: subscriptionIdentity.id,
          changeType: pricing.action,
          targetPlanId: args.planId,
          idempotencyKey: `subscription-change:${team.id}:${product}:${args.attemptId}`,
          externalPaymentId: scheduledExternalId,
          requesterUserId: args.userId,
          payProvider: providerEnum,
          paymentMethodRef,
          paymentRequired: false,
          priceSnapshot: {
            version: 1,
            finalAmount: 0,
            currency: "KRW",
            targetPlanId: args.planId,
            couponCode: null,
            calculatedAt: now.toISOString(),
          },
          billingKey,
        });

    const updated = await prisma.$transaction(async (tx) => {
      await lockSubscriptionChangeApply(tx, scheduledChange.id);
      const currentChange = await tx.subscriptionChange.findUnique({
        where: { id: scheduledChange.id },
        select: { paymentStatus: true, applyStatus: true },
      });
      if (!currentChange) throw err(404, "SUBSCRIPTION_CHANGE_NOT_FOUND");
      if (currentChange.applyStatus === "APPLIED") {
        return tx.team.findUnique({
          where: { id: team.id },
          select: TEAM_RETURN_SELECT,
        });
      }
      if (
        currentChange.paymentStatus !== "NOT_REQUIRED" ||
        !["PENDING", "FAILED"].includes(currentChange.applyStatus)
      ) {
        throw err(409, "SUBSCRIPTION_CHANGE_NOT_RECOVERABLE");
      }
      const current = await getLockedProductSubscriptionSnapshot(team.id, product, tx);
      const patch = buildScheduledDowngradePatch({
        targetPlanId: args.planId,
        planExpiresAt: current.planExpiresAt!,
      });

      const alreadyScheduled =
        current.pendingPlanId === patch.pendingPlanId &&
        current.pendingPlan === patch.pendingPlan &&
        current.pendingPlanStartsAt?.getTime() === patch.pendingPlanStartsAt?.getTime() &&
        current.nextPaymentAmount === patch.nextPaymentAmount;

      if (alreadyScheduled) {
        await markSubscriptionChangeApplied({
          id: scheduledChange.id,
          client: tx,
        });
        return tx.team.findUnique({
          where: { id: team.id },
          select: TEAM_RETURN_SELECT,
        });
      }

      const updatedProductSubscription = await tx.teamProductSubscription.upsert({
        where: { teamId_product: { teamId: team.id, product } },
        create: {
          ...current,
          ...patch,
        },
        update: patch,
      });

      const updatedTeam = await tx.team.update({
        where: { id: team.id },
        data: {
          plan: updatedProductSubscription.plan,
          planId: updatedProductSubscription.planId,
          membershipStatus: updatedProductSubscription.membershipStatus,
          payProvider: updatedProductSubscription.payProvider,
          billingKey: null,
          nextBillingAt: updatedProductSubscription.nextBillingAt,
          planExpiresAt: updatedProductSubscription.planExpiresAt,
          nextPaymentAmount: updatedProductSubscription.nextPaymentAmount,
          pendingPlan: updatedProductSubscription.pendingPlan,
          pendingPlanId: updatedProductSubscription.pendingPlanId,
          pendingPlanStartsAt: updatedProductSubscription.pendingPlanStartsAt,
          cancelRequestedAt: updatedProductSubscription.cancelRequestedAt,
          lastPaymentId: updatedProductSubscription.lastPaymentId,
          lastPaidAt: updatedProductSubscription.lastPaidAt,
        },
        select: TEAM_RETURN_SELECT,
      });

      await logTeamBillingHistory(
        {
          teamId: team.id,
          type: "CANCEL",
          status: "SUCCESS",
          provider: current.payProvider,
          plan: current.plan,
          planId: current.planId,
          amount: 0,
          meta: {
            kind:
              pricing.action === "SCHEDULE_CHANGE"
                ? "PLAN_CHANGE_SCHEDULED"
                : "PLAN_CHANGE_DOWNGRADED",
            product,
            targetPlanId: args.planId,
          },
        },
        tx,
      );

      await markSubscriptionChangeApplied({
        id: scheduledChange.id,
        client: tx,
      });
      return updatedTeam;
    });

    if (!updated) throw err(404, "TEAM_NOT_FOUND");

    const { safe, hasBillingKey } = withoutBillingKey(updated);

    return {
      action:
        pricing.action === "SCHEDULE_CHANGE"
          ? "CHANGE_SCHEDULED"
          : "DOWNGRADE_SCHEDULED",
      mode:
        pricing.action === "SCHEDULE_CHANGE"
          ? "CHANGE_SCHEDULED"
          : "DOWNGRADE_SCHEDULED",
      payNowAmountWon: 0,
      team: {
        ...safe,
        planExpiresAt: iso(updated.planExpiresAt),
        nextBillingAt: iso(updated.nextBillingAt),
        pendingPlanStartsAt: iso(updated.pendingPlanStartsAt),
        cancelRequestedAt: iso(updated.cancelRequestedAt),
        lastPaidAt: iso(updated.lastPaidAt),

        planExpiresAtYmdhm: ymdhm(updated.planExpiresAt),
        nextBillingAtYmdhm: ymdhm(updated.nextBillingAt),
        pendingPlanStartsAtYmdhm: ymdhm(updated.pendingPlanStartsAt),
        cancelRequestedAtYmdhm: ymdhm(updated.cancelRequestedAt),
        lastPaidAtYmdhm: ymdhm(updated.lastPaidAt),

        hasBillingKey,
      },
      note:
        pricing.action === "SCHEDULE_CHANGE"
          ? "PLAN_CHANGE_WILL_APPLY_NEXT_CYCLE"
          : "DOWNGRADE_WILL_APPLY_NEXT_CYCLE",
    };
  }

  // --------------------------------------------------------------------------
  // 2. 결제 금액 계산
  // --------------------------------------------------------------------------
  const payNowAmountWon = pricing.payNowAmountWon;
  const paymentExternalId =
    payNowAmountWon > 0
      ? args.recovery?.paymentExternalId ??
        args.initialPriceSnapshot?.paymentExternalId ??
        createSubscriptionPaymentId(target.code, args.attemptId)
      : `nocharge_${args.attemptId}`;
  const requestedChangeType =
    Boolean(hasActiveCycle) && tierTarget > tierNow
      ? "UPGRADE"
      : Boolean(hasActiveCycle) && tierTarget === tierNow
        ? "RENEW"
        : "SUBSCRIBE";
  const subscriptionChange = args.recovery
    ? await prisma.subscriptionChange
        .findUniqueOrThrow({ where: { id: args.recovery.changeId } })
        .then((change) => {
          if (
            change.teamId !== team.id ||
            change.product !== product ||
            change.subscriptionId !== subscriptionIdentity.id ||
            change.targetPlanId !== args.planId ||
            change.requesterUserId !== args.userId ||
            change.changeType !== args.recovery?.changeType ||
            change.payProvider !== providerEnum ||
            change.paymentMethodRef !== args.recovery?.paymentMethodRef ||
            change.externalPaymentId !== args.recovery?.paymentExternalId
          ) {
            throw err(409, "SUBSCRIPTION_CHANGE_REPLAY_IDENTITY_MISMATCH");
          }
          return { ...change, wasCreated: false as const };
        })
    : await prepareSubscriptionChangeWithPaymentMethod({
        teamId: team.id,
        product,
        subscriptionId: subscriptionIdentity.id,
        changeType: requestedChangeType,
        targetPlanId: args.planId,
        idempotencyKey: `subscription-change:${team.id}:${product}:${args.attemptId}`,
        externalPaymentId: paymentExternalId,
        requesterUserId: args.userId,
        payProvider: providerEnum,
        paymentMethodRef,
        paymentRequired: payNowAmountWon > 0,
        priceSnapshot: {
          version: 1,
          finalAmount: payNowAmountWon,
          currency: "KRW",
          targetPlanId: args.planId,
          couponCode: args.couponCode?.trim() || null,
          calculatedAt: now.toISOString(),
        },
        billingKey,
      });
  const applyAsUpgrade = subscriptionChange.changeType === "UPGRADE";
  const applyAsRenew = subscriptionChange.changeType === "RENEW";
  const localApplyReplayEligible =
    ["CONFIRMED", "NOT_REQUIRED"].includes(subscriptionChange.paymentStatus) &&
    (subscriptionChange.applyStatus === "PENDING" ||
      subscriptionChange.applyStatus === "FAILED");
  const recoveringLocalApply = localApplyReplayEligible;
  const resumingStalePendingPayment =
    !subscriptionChange.wasCreated &&
    subscriptionChange.paymentStatus === "PENDING" &&
    subscriptionChange.applyStatus === "PENDING" &&
    subscriptionChange.createdAt.getTime() <= now.getTime() - 5 * 60_000;

  if (!subscriptionChange.wasCreated && subscriptionChange.applyStatus === "APPLIED") {
    const current = await prisma.team.findUnique({
      where: { id: team.id },
      select: TEAM_RETURN_SELECT,
    });
    if (!current) throw err(404, "TEAM_NOT_FOUND");
    return {
      action: "NO_CHANGE",
      mode: "ALREADY_COMPLETED",
      payNowAmountWon,
      team: serializeCompletionTeam(current),
      note: "IDEMPOTENT_PAYMENT_ALREADY_COMPLETED",
    };
  }

  if (
    !subscriptionChange.wasCreated &&
    !recoveringLocalApply &&
    !resumingStalePendingPayment
  ) {
    throw err(409, "PAYMENT_ATTEMPT_IN_PROGRESS");
  }

  const paymentAttempt = {
    kind: "reserved" as const,
    historyId: (
      await ensurePaymentAttemptAuditProjection({
        teamId: team.id,
        userId: args.userId,
        provider: providerEnum,
        plan: targetPlanType,
        planId: args.planId,
        product,
        subscriptionId: subscriptionIdentity.id,
        externalId: paymentExternalId,
        attemptId: args.attemptId,
        amount: payNowAmountWon,
        pastDueRecovery:
          args.recovery?.pastDueRecovery ??
          args.initialPriceSnapshot?.pastDueRecovery,
      })
    ).id,
  };

  const couponPayload = pricing.couponPayload;
  let couponRedemptionId: string | null = null;
  let updated: any;
  let localApplyAlreadyCompleted = false;
  let action: CompleteAction = "NO_CHANGE";
  let providerPaymentConfirmed =
    subscriptionChange.paymentStatus === "CONFIRMED";
  let providerPaymentAttempted = false;
  let providerFailureDefinitive = false;
  let workflowPaymentRecorded =
    payNowAmountWon === 0 || recoveringLocalApply;

  try {

  // --------------------------------------------------------------------------
  // 3. 쿠폰 예약(APPLIED) & PortOne 결제 요청
  // --------------------------------------------------------------------------
  if (couponPayload && args.userId) {
    if (recoveringLocalApply && recoveryCouponRedemption) {
      couponRedemptionId = recoveryCouponRedemption.id;
    } else {
      const quotedDiscountAmount = couponPayload.discountAmount;
      if (quotedDiscountAmount == null) {
        throw err(409, "COUPON_REQUOTE_REQUIRED");
      }
      couponRedemptionId = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "coupon" WHERE id = ${couponPayload.couponId} FOR UPDATE`;

        const existing = await tx.couponRedemption.findUnique({
          where: {
            couponId_userId: {
              couponId: couponPayload.couponId,
              userId: args.userId,
            },
          },
        });
        if (existing && existing.status !== "CANCELED") {
          const meta =
            existing.meta &&
            typeof existing.meta === "object" &&
            !Array.isArray(existing.meta)
              ? (existing.meta as Record<string, unknown>)
              : {};
          if (
            existing.teamId === team.id &&
            meta.attemptId === args.attemptId &&
            ["APPLIED", "REDEEMED"].includes(existing.status)
          ) {
            return existing.id;
          }
          throw err(400, "COUPON_USER_LIMIT");
        }

        const amountBeforeCoupon = payNowAmountWon + quotedDiscountAmount;
      const validated = await validateCouponForPlan({
        code: couponPayload.code,
        plan: target,
        amountWon: amountBeforeCoupon,
        userId: args.userId,
        now,
        client: tx,
      });

      if (!validated.ok) throw err(400, validated.error);
      if (!isDiscountCoupon(validated.coupon.benefitType)) {
        throw err(400, "COUPON_NOT_DISCOUNT");
      }

      const freshDiscount = computeDiscount({
        coupon: validated.coupon,
        amountWon: amountBeforeCoupon,
      });
      if (
        !freshDiscount ||
        freshDiscount.discountAmount !== quotedDiscountAmount ||
        freshDiscount.finalAmount !== payNowAmountWon
      ) {
        throw err(409, "COUPON_REQUOTE_REQUIRED");
      }

      if (existing) {
        const updated = await tx.couponRedemption.update({
          where: { id: existing.id },
          data: {
            status: "APPLIED",
            appliedAt: new Date(),
            canceledAt: null,
            redeemedAt: null,
            discountAmount: couponPayload.discountAmount,
            meta: {
              code: couponPayload.code,
              benefitType: couponPayload.benefitType,
              attemptId: args.attemptId,
              payNowAmountWon,
            },
          },
        });
        return updated.id;
      }

      const created = await tx.couponRedemption.create({
        data: {
          couponId: couponPayload.couponId,
          userId: args.userId,
          teamId: team.id,
          status: "APPLIED",
          discountAmount: couponPayload.discountAmount,
          appliedAt: new Date(),
          meta: {
            code: couponPayload.code,
            benefitType: couponPayload.benefitType,
            attemptId: args.attemptId,
            payNowAmountWon,
          },
        },
      });
      return created.id;
    });
    }
  }

  let paymentId: string | null = null;
  let paidAt: Date | null = null;
  let paidMeta: any = null;

  if (payNowAmountWon > 0) {
    paymentId = paymentExternalId;
    if (recoveringLocalApply) {
      paidAt = subscriptionChange.paymentConfirmedAt ?? subscriptionChange.updatedAt;
      paidMeta = { recoveredLocalApply: true };
    } else {
      providerPaymentAttempted = true;
      const storeId = args.portone?.storeId ?? getPortOneStoreId();
      const channel =
        args.portone && "channelKey" in args.portone
          ? { channelKey: args.portone.channelKey ?? null }
          : resolvePortOneChannel(args.payProvider, "BILLING_KEY");
      const postPayment = args.portone?.post ?? portonePostV2;

    const orderName =
      applyAsUpgrade
        ? `${target.name} 업그레이드 차액 결제`
        : applyAsRenew
          ? `${target.name} 구독 연장 결제`
          : `${target.name} 구독 결제`;

    let confirmed;
    try {
      confirmed = await confirmSubscriptionPayment({
      post: postPayment,
      storeId,
      channelKey: channel.channelKey ?? null,
      billingKey,
      paymentId,
      amount: payNowAmountWon,
      orderName,
      customer: args.customer,
      attemptId: args.attemptId,
        customData: {
        kind: "SUBSCRIPTION_PAYNOW",
        mode:
          applyAsUpgrade
            ? "UPGRADE"
            : applyAsRenew
              ? "RENEW"
              : "SUBSCRIBE",
        teamId: team.id,
        product,
        subscriptionId: subscriptionIdentity.id,
        targetPlanId: args.planId,
        targetPlanType,
        payProvider: args.payProvider,
        payNowAmountWon,
        attemptId: args.attemptId,
        },
      });
    } catch (error) {
      providerFailureDefinitive =
        isDefinitiveSubscriptionPaymentFailure(error);
      throw error;
    }
    providerPaymentConfirmed = true;
    const persistConfirmation =
      args.portone?.persistConfirmation ?? markSubscriptionChangePaymentConfirmed;
    await persistConfirmation({
      id: subscriptionChange.id,
      externalPaymentId: paymentExternalId,
      paymentConfirmedAt: confirmed.paidAt,
    });
    workflowPaymentRecorded = true;
    paidAt = confirmed.paidAt;
      paidMeta = confirmed.paidMeta;
    }

    if (applyAsUpgrade) action = "UPGRADED";
    else if (applyAsRenew) action = "RENEWED";
    else action = "SUBSCRIBED";
  } else {
    // 0원 결제 (무료 플랜 등)
    if (applyAsUpgrade)
      action = "UPGRADED_NO_PRORATION";
    else action = "SUBSCRIBED_NO_CHARGE";
  }

  // --------------------------------------------------------------------------
  // 4. DB 업데이트 (트랜잭션)
  // --------------------------------------------------------------------------
  updated = await prisma.$transaction(async (tx) => {
    await lockSubscriptionChangeApply(tx, subscriptionChange.id);
    const currentChange = await tx.subscriptionChange.findUnique({
      where: { id: subscriptionChange.id },
      select: { paymentStatus: true, applyStatus: true },
    });
    if (!currentChange) throw err(404, "SUBSCRIPTION_CHANGE_NOT_FOUND");
    if (currentChange.applyStatus === "APPLIED") {
      localApplyAlreadyCompleted = true;
      const currentTeam = await tx.team.findUnique({
        where: { id: team.id },
        select: TEAM_RETURN_SELECT,
      });
      if (!currentTeam) throw err(404, "TEAM_NOT_FOUND");
      return currentTeam;
    }
    if (
      !["CONFIRMED", "NOT_REQUIRED"].includes(currentChange.paymentStatus) ||
      !["PENDING", "FAILED"].includes(currentChange.applyStatus)
    ) {
      throw err(409, "SUBSCRIPTION_CHANGE_NOT_RECOVERABLE");
    }
    const authoritativeExists = await tx.teamProductSubscription.count({
      where: { id: subscriptionIdentity.id, teamId: team.id, product },
    });
    if (authoritativeExists !== 1) {
      throw err(409, "TEAM_PRODUCT_SUBSCRIPTION_NOT_FOUND");
    }

    // [CASE A] 업그레이드 (중도 변경)
    // - Limit(한도): 새 플랜의 quotaArticle, quotaResume 값으로 업데이트
    // - Usage(사용량): 유지 (자연 차감 효과)
    if (applyAsUpgrade) {
      const teamPatch = buildImmediateUpgradePatch({
        targetPlanId: args.planId,
        planExpiresAt: currentSubscription.planExpiresAt,
        nextBillingAt: currentSubscription.nextBillingAt,
        payProvider: providerEnum,
        billingKey,
        lastPaymentId: paymentId,
        lastPaidAt: paidAt,
      });
      const authoritativeSubscription =
        await upsertProductSubscriptionFromLegacyTeam(
          {
            ...team,
            ...teamPatch,
            lastPaymentId: teamPatch.lastPaymentId ?? team.lastPaymentId,
            lastPaidAt: teamPatch.lastPaidAt ?? team.lastPaidAt,
          },
          product,
          tx,
        );
      const t = await tx.team.update({
        where: { id: team.id },
        data: { ...teamPatch, billingKey: null },
        select: {
          id: true,
          slug: true,
          name: true,
          plan: true,
          planId: true,
          planCategory: true,
          membershipStatus: true,
          payProvider: true,
          billingKey: true,
          planExpiresAt: true,
          nextBillingAt: true,
          nextPaymentAmount: true,
          pendingPlan: true,
          pendingPlanId: true,
          pendingPlanStartsAt: true,
          cancelRequestedAt: true,
          lastPaymentId: true,
          lastPaidAt: true,
          // 리턴값에 포함하여 UI 즉시 반영
          limitArticleMonthly: true,
          limitResumeMonthly: true,
          usageArticleMonthly: true,
          usageResumeMonthly: true,
        },
      });

      await markPaymentAttemptSucceeded(tx, {
        historyId: paymentAttempt.historyId,
        teamId: t.id,
        userId: args.userId,
        provider: t.payProvider,
        plan: t.plan,
        planId: t.planId,
        amount: payNowAmountWon,
        action,
        paidAt,
        paidMeta,
        product,
        subscriptionId: subscriptionIdentity.id,
        pastDueRecovery: args.initialPriceSnapshot?.pastDueRecovery,
      });

      if (couponRedemptionId) {
        await tx.couponRedemption.update({
          where: { id: couponRedemptionId },
          data: {
            status: "REDEEMED",
            redeemedAt: new Date(),
            meta: {
              code: couponPayload?.code,
              benefitType: couponPayload?.benefitType,
              payNowAmountWon,
            },
          },
        });
      }

      await markSubscriptionChangeApplied({
        id: subscriptionChange.id,
        client: tx,
      });
      return { ...t, billingKey: authoritativeSubscription.billingKey };
    }

    // [CASE B] 신규 구독 또는 갱신 (새로운 주기 시작)
    // - Limit(한도): 새 플랜 값으로 설정
    // - Usage(사용량): 0으로 초기화
    const teamPatch = args.initialPriceSnapshot?.pastDueRecovery
      ? {
          ...buildRecurringRenewalPatch({
            targetPlanId: args.planId,
            currentPlanExpiresAt: currentExpiresAtExclusive,
            now,
          }),
          payProvider: providerEnum,
          billingKey,
          lastPaymentId: paymentId,
          lastPaidAt: paidAt,
        }
      : buildCheckoutSubscriptionPatch({
          targetPlanId: args.planId,
          currentPlanExpiresAt: currentExpiresAtExclusive,
          renewFromCurrentCycle:
            applyAsRenew && !!currentExpiresAtExclusive,
          now,
          payProvider: providerEnum,
          billingKey,
          lastPaymentId: paymentId,
          lastPaidAt: paidAt,
        });
    const authoritativeSubscription =
      await upsertProductSubscriptionFromLegacyTeam(
        {
          ...team,
          ...teamPatch,
          lastPaymentId: teamPatch.lastPaymentId ?? team.lastPaymentId,
          lastPaidAt: teamPatch.lastPaidAt ?? team.lastPaidAt,
        },
        product,
        tx,
      );
    const t = await tx.team.update({
      where: { id: team.id },
      data: { ...teamPatch, billingKey: null },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        planId: true,
        planCategory: true,
        membershipStatus: true,
        payProvider: true,
        billingKey: true,
        planExpiresAt: true,
        nextBillingAt: true,
        nextPaymentAmount: true,
        pendingPlan: true,
        pendingPlanId: true,
        pendingPlanStartsAt: true,
        cancelRequestedAt: true,
        lastPaymentId: true,
        lastPaidAt: true,
        // UI 반영용 필드
        limitArticleMonthly: true,
        limitResumeMonthly: true,
        usageArticleMonthly: true,
        usageResumeMonthly: true,
      },
    });

    await markPaymentAttemptSucceeded(tx, {
      historyId: paymentAttempt.historyId,
      teamId: t.id,
      userId: args.userId,
      provider: t.payProvider,
      plan: t.plan,
      planId: t.planId,
      amount: payNowAmountWon,
      action,
      paidAt,
      paidMeta,
      product,
      subscriptionId: subscriptionIdentity.id,
      pastDueRecovery: args.initialPriceSnapshot?.pastDueRecovery,
    });

    if (couponRedemptionId) {
      await tx.couponRedemption.update({
        where: { id: couponRedemptionId },
        data: {
          status: "REDEEMED",
          redeemedAt: new Date(),
          meta: {
            code: couponPayload?.code,
            benefitType: couponPayload?.benefitType,
            payNowAmountWon,
          },
        },
      });
    }

    await markSubscriptionChangeApplied({
      id: subscriptionChange.id,
      client: tx,
    });
    return { ...t, billingKey: authoritativeSubscription.billingKey };
  });
  } catch (e) {
    if (
      couponRedemptionId &&
      !workflowPaymentRecorded &&
      (!providerPaymentAttempted || providerFailureDefinitive)
    ) {
      await prisma.couponRedemption
        .update({
          where: { id: couponRedemptionId },
          data: { status: "CANCELED", canceledAt: new Date() },
        })
        .catch(() => {});
    }
    if (
      !providerPaymentConfirmed &&
      (!providerPaymentAttempted || providerFailureDefinitive)
    ) {
      await markPaymentAttemptFailed({
        historyId: paymentAttempt.historyId,
        error: e,
        product,
        subscriptionId: subscriptionIdentity.id,
        pastDueRecovery: args.initialPriceSnapshot?.pastDueRecovery,
      }).catch(() => {});
    }
    if (workflowPaymentRecorded && args.recordApplyFailure !== false) {
      await markSubscriptionChangeApplyFailed({
        id: subscriptionChange.id,
        error: errorReason(e),
      }).catch(() => {});
    } else if (
      providerPaymentAttempted &&
      !providerPaymentConfirmed &&
      providerFailureDefinitive
    ) {
      await markSubscriptionChangePaymentFailed({
        id: subscriptionChange.id,
        error: errorReason(e),
      }).catch(() => {});
    } else if (providerPaymentAttempted && !workflowPaymentRecorded) {
      await recordSubscriptionChangePaymentUncertain({
        id: subscriptionChange.id,
        error: errorReason(e),
      }).catch(() => {});
    }
    throw e;
  }

  if (localApplyAlreadyCompleted) {
    return {
      action: "NO_CHANGE",
      mode: "ALREADY_COMPLETED",
      payNowAmountWon,
      team: serializeCompletionTeam(updated),
      note: "IDEMPOTENT_PAYMENT_ALREADY_COMPLETED",
    };
  }

  const teamPayload = serializeCompletionTeam(updated);

  if (applyAsUpgrade) {
    return {
      action,
      mode: "UPGRADED",
      payNowAmountWon,
      prorationWon: payNowAmountWon,
      team: teamPayload,
      note: "UPGRADE_APPLIED_IMMEDIATELY_TODO_RENEW_SCHEDULER",
    };
  }

  return {
    action,
    mode: applyAsRenew ? "RENEWED" : "SUBSCRIBED",
    payNowAmountWon,
    team: teamPayload,
    note: "PAYMENT_OK_DB_UPDATED_TODO_RENEW_SCHEDULER",
  };
}
