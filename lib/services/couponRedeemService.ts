import { prisma } from "@/lib/prisma";
import {
  addKstMonthsKeepingDay,
  kstMidnight,
  nextChargeAtFromExpiresAtExclusive,
} from "@/domain/billing/teamMembership";
import { getLockedProductSubscriptionSnapshot } from "@/domain/billing/productSubscription";
import { logTeamBillingHistory } from "@/domain/billing/history/log";
import { getMonthlyAmountByPlanId, getPlanProduct, type PlanId } from "@/config/billing/plans";
import {
  normalizeCouponCode,
  resolveGrantPlan,
  validateCouponForPlan,
} from "@/lib/services/couponService";
import { serviceError } from "@/lib/services/serviceError";
import { Prisma, type ProductLine } from "@prisma/client";

function couponMetaAutoRenew(meta: Prisma.JsonValue) {
  if (!meta || typeof meta !== "object") return false;
  return (meta as Record<string, unknown>).autoRenew === true;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildCouponRedemptionMeta(input: {
  couponCode: string;
  product: ProductLine | null;
  subscriptionId: string;
  grantPlanId: string;
  previousPlanId: string | null;
  previousBoundary: Date | null;
  grantBoundary: Date;
  autoRenew: boolean;
  grantMonths: number;
}) {
  return {
    code: input.couponCode,
    product: input.product,
    subscriptionId: input.subscriptionId,
    grantedPlanId: input.grantPlanId,
    previousPlanId: input.previousPlanId,
    previousBoundary: toIso(input.previousBoundary),
    grantBoundary: toIso(input.grantBoundary),
    autoRenew: input.autoRenew,
    grantMonths: input.grantMonths,
  };
}

export async function redeemCouponForTeam(input: {
  team: any;
  user: any;
  code: string;
}) {
  const now = new Date();
  const code = normalizeCouponCode(input.code);

  const updated = await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      throw serviceError(404, "COUPON_NOT_FOUND", "COUPON_NOT_FOUND");
    }

    await tx.$queryRaw`SELECT id FROM "coupon" WHERE id = ${coupon.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "team" WHERE id = ${input.team.id} FOR UPDATE`;

    const plan = resolveGrantPlan(coupon);
    if (!plan) {
      throw serviceError(400, "COUPON_PLAN_NOT_FOUND", "COUPON_PLAN_NOT_FOUND");
    }

    const validated = await validateCouponForPlan({
      code,
      plan,
      amountWon: 0,
      userId: input.user?.id ?? undefined,
      now,
      client: tx,
    });

    if (!validated.ok) {
      throw serviceError(400, "INVALID_COUPON", validated.error);
    }

    const validatedCoupon = validated.coupon;
    if (validatedCoupon.benefitType !== "PLAN_GRANT") {
      throw serviceError(400, "COUPON_NOT_PLAN_GRANT", "COUPON_NOT_PLAN_GRANT");
    }

    const grantMonths = validatedCoupon.grantMonths ?? 1;
    if (grantMonths <= 0) {
      throw serviceError(400, "COUPON_INVALID_GRANT", "COUPON_INVALID_GRANT");
    }

    const product = getPlanProduct(plan.id as PlanId);
    if (!product) {
      throw serviceError(400, "COUPON_PLAN_NOT_FOUND", "COUPON_PLAN_NOT_FOUND");
    }

    const current = await getLockedProductSubscriptionSnapshot(
      input.team.id,
      product,
      tx,
    );
    if (current.cancelRequestedAt) {
      throw serviceError(
        409,
        "COUPON_NOT_ALLOWED_WHILE_CANCEL_PENDING",
        "COUPON_NOT_ALLOWED_WHILE_CANCEL_PENDING",
      );
    }

    const hasActiveCycle =
      !!current.planExpiresAt && now.getTime() < current.planExpiresAt.getTime();
    const originalPlanId = current.planId;
    const originalBoundary = current.planExpiresAt;

    const shouldAutoRenewGrant =
      couponMetaAutoRenew(validatedCoupon.meta as Prisma.JsonValue) &&
      !!current.billingKey &&
      !!current.payProvider;
    const shouldRestorePreviousPlan = hasActiveCycle && shouldAutoRenewGrant && current.planId !== plan.id;

    const baseDate =
      hasActiveCycle && current.planExpiresAt ? current.planExpiresAt : kstMidnight(now);
    const nextExpiresAt = addKstMonthsKeepingDay(baseDate, grantMonths);
    const nextBillingAt = shouldAutoRenewGrant
      ? nextChargeAtFromExpiresAtExclusive(nextExpiresAt)
      : null;

    const pendingPlanType = shouldRestorePreviousPlan ? current.plan : null;
    const pendingPlanId = shouldRestorePreviousPlan ? current.planId : null;
    const pendingPlanStartsAt = shouldRestorePreviousPlan ? nextExpiresAt : null;
    const nextPaymentAmount = shouldRestorePreviousPlan
      ? getMonthlyAmountByPlanId(current.planId)
      : shouldAutoRenewGrant
        ? plan.monthlyAmountWon
        : 0;

    const updatedSubscription = await tx.teamProductSubscription.upsert({
      where: { teamId_product: { teamId: input.team.id, product } },
      create: {
        teamId: input.team.id,
        product,
        plan: plan.planType,
        planId: plan.id,
        membershipStatus: "ACTIVE",
        payProvider: shouldAutoRenewGrant ? current.payProvider : null,
        billingKey: shouldAutoRenewGrant ? current.billingKey : null,
        nextPaymentAmount,
        nextBillingAt,
        planExpiresAt: nextExpiresAt,
        pendingPlan: pendingPlanType,
        pendingPlanId,
        pendingPlanStartsAt,
        cancelRequestedAt: null,
        lastPaymentId: current.lastPaymentId,
        lastPaidAt: current.lastPaidAt,
      },
      update: {
        plan: plan.planType,
        planId: plan.id,
        membershipStatus: "ACTIVE",
        payProvider: shouldAutoRenewGrant ? current.payProvider : null,
        billingKey: shouldAutoRenewGrant ? current.billingKey : null,
        nextPaymentAmount,
        nextBillingAt,
        planExpiresAt: nextExpiresAt,
        pendingPlan: pendingPlanType,
        pendingPlanId,
        pendingPlanStartsAt,
        cancelRequestedAt: null,
        lastPaymentId: current.lastPaymentId,
        lastPaidAt: current.lastPaidAt,
      },
    });

    const updatedTeam = await tx.team.update({
      where: { id: input.team.id },
      data: {
        plan: updatedSubscription.plan,
        planId: updatedSubscription.planId,
        planCategory: plan.category,
        membershipStatus: updatedSubscription.membershipStatus,
        payProvider: updatedSubscription.payProvider,
        billingKey: updatedSubscription.billingKey,
        nextBillingAt: updatedSubscription.nextBillingAt,
        planExpiresAt: updatedSubscription.planExpiresAt,
        nextPaymentAmount: updatedSubscription.nextPaymentAmount,
        pendingPlan: updatedSubscription.pendingPlan,
        pendingPlanId: updatedSubscription.pendingPlanId,
        pendingPlanStartsAt: updatedSubscription.pendingPlanStartsAt,
        cancelRequestedAt: updatedSubscription.cancelRequestedAt,
        lastPaymentId: updatedSubscription.lastPaymentId,
        lastPaidAt: updatedSubscription.lastPaidAt,
        limitArticleMonthly: plan.quotaArticle,
        limitResumeMonthly: plan.quotaResume,
      },
      select: {
        id: true,
        plan: true,
        planId: true,
        planCategory: true,
        planExpiresAt: true,
        nextBillingAt: true,
        nextPaymentAmount: true,
        membershipStatus: true,
        payProvider: true,
        billingKey: true,
        pendingPlan: true,
        pendingPlanId: true,
        pendingPlanStartsAt: true,
        cancelRequestedAt: true,
      },
    });

    const redemption = await tx.couponRedemption.create({
      data: {
        couponId: validatedCoupon.id,
        userId: input.user.id,
        teamId: input.team.id,
        status: "REDEEMED",
        product,
        subscriptionId: updatedSubscription.id,
        beforePlanId: originalPlanId,
        afterPlanId: updatedSubscription.planId,
        beforeStatus: current.membershipStatus,
        afterStatus: updatedSubscription.membershipStatus,
        redeemedAt: now,
        discountAmount: 0,
        meta: buildCouponRedemptionMeta({
          couponCode: validatedCoupon.code,
          product,
          subscriptionId: updatedSubscription.id,
          grantPlanId: plan.id,
          previousPlanId: originalPlanId,
          previousBoundary: originalBoundary,
          grantBoundary: nextExpiresAt,
          autoRenew: shouldAutoRenewGrant,
          grantMonths,
        }),
      },
    });

    await logTeamBillingHistory(
      {
        teamId: input.team.id,
        userId: input.user.id,
        type: "PAYMENT",
        status: "SUCCESS",
        provider: updatedSubscription.payProvider,
        plan: updatedSubscription.plan,
        planId: updatedSubscription.planId,
        product,
        subscriptionId: updatedSubscription.id,
        beforePlanId: originalPlanId,
        afterPlanId: updatedSubscription.planId,
        beforeStatus: current.membershipStatus,
        afterStatus: updatedSubscription.membershipStatus,
        amount: 0,
        meta: {
          kind: "COUPON_GRANT",
          product,
          subscriptionId: updatedSubscription.id,
          redemptionId: redemption.id,
          previousPlanId: originalPlanId,
          grantedPlanId: plan.id,
          previousBoundary: toIso(originalBoundary),
          grantBoundary: toIso(nextExpiresAt),
          autoRenew: shouldAutoRenewGrant,
        },
      },
      tx,
    );

    return { team: updatedTeam, coupon: validatedCoupon.code };
  });

  return updated;
}
