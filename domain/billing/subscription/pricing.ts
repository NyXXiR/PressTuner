import type { CouponBenefitType, PlanType } from "@prisma/client";

import {
  getPlan,
  type BillingPlan,
  type PlanId,
  type PlanPromotion,
} from "@/config/billing/plans";
import { computeSubscriptionQuote } from "@/domain/billing/subscription/policy";
import {
  computeDiscount,
  isDiscountCoupon,
  validateCouponForPlan,
} from "@/lib/services/couponService";

type BillingDomainError = Error & { status?: number; code?: string };

function billingError(status: number, code: string): BillingDomainError {
  const error = new Error(code) as BillingDomainError;
  error.status = status;
  error.code = code;
  return error;
}

export type BillingDiscountSummary = {
  code: string;
  name: string;
  description: string | null;
  benefitType: CouponBenefitType | "PLAN_PROMOTION";
  discountAmountWon: number;
  discountPercent: number | null;
};

export type BillingCouponPayload = {
  couponId: string;
  code: string;
  discountAmount: number;
  benefitType: CouponBenefitType;
};

function computePromotionDiscount(args: {
  plan: BillingPlan;
  amountWon: number;
}): BillingDiscountSummary | null {
  const promo = args.plan.promotion;
  const amount = Math.max(0, args.amountWon);
  if (!promo || amount <= 0) return null;

  let discountAmountWon = 0;
  if (promo.type === "PERCENT") {
    discountAmountWon = Math.floor((amount * promo.value) / 100);
  } else if (promo.type === "FIXED_AMOUNT") {
    discountAmountWon = promo.value;
  }

  discountAmountWon = Math.min(amount, Math.max(0, discountAmountWon));
  if (discountAmountWon <= 0) return null;

  return {
    code: `PROMO:${args.plan.id}`,
    name: promo.label ?? "플랜 프로모션",
    description: describePromotion(promo),
    benefitType: "PLAN_PROMOTION",
    discountAmountWon,
    discountPercent: promo.type === "PERCENT" ? promo.value : null,
  };
}

function describePromotion(promo: PlanPromotion) {
  if (promo.duration === "ONCE") return "첫 결제에만 적용됩니다.";
  if (promo.duration === "REPEATING") {
    const months = promo.durationMonths ?? 1;
    return `${months}개월 동안 적용됩니다.`;
  }
  return "프로모션 기간 동안 적용됩니다.";
}

export async function resolveSubscriptionPricing(args: {
  targetPlanId: PlanId;
  userId?: string | null;
  couponCode?: string | null;
  now?: Date;
  current: {
    planId: string | null;
    plan: PlanType;
    membershipStatus: string;
    planExpiresAt: Date | null;
    pendingPlan: string | null;
    pendingPlanStartsAt: Date | null;
    cancelRequestedAt?: Date | null;
  };
}) {
  const target = getPlan(args.targetPlanId);
  const quote = computeSubscriptionQuote({
    targetPlanId: args.targetPlanId,
    now: args.now,
    current: {
      planId: args.current.planId,
      plan: args.current.plan,
      membershipStatus: args.current.membershipStatus,
      planExpiresAt: args.current.planExpiresAt,
      pendingPlan: args.current.pendingPlan,
      pendingPlanStartsAt: args.current.pendingPlanStartsAt,
    },
  });

  const basePayNowAmountWon = quote.payNowAmountWon;
  let payNowAmountWon = basePayNowAmountWon;
  const discounts: BillingDiscountSummary[] = [];

  const promotion = computePromotionDiscount({
    plan: target,
    amountWon: payNowAmountWon,
  });
  if (promotion) {
    payNowAmountWon = Math.max(0, payNowAmountWon - promotion.discountAmountWon);
    discounts.push(promotion);
  }

  let coupon: BillingDiscountSummary | null = null;
  let couponPayload: BillingCouponPayload | null = null;
  const couponCode = args.couponCode?.trim() ?? "";

  if (couponCode) {
    if (args.current.cancelRequestedAt) {
      throw billingError(409, "COUPON_NOT_ALLOWED_WHILE_CANCEL_PENDING");
    }
    if (basePayNowAmountWon <= 0) {
      throw billingError(400, "COUPON_NOT_APPLICABLE_NO_PAYMENT");
    }

    const validated = await validateCouponForPlan({
      code: couponCode,
      plan: target,
      amountWon: payNowAmountWon,
      userId: args.userId,
      now: args.now,
    });

    if (!validated.ok) throw billingError(400, validated.error);

    const row = validated.coupon;
    if (!isDiscountCoupon(row.benefitType)) {
      throw billingError(400, "COUPON_NOT_DISCOUNT");
    }

    const discount = computeDiscount({
      coupon: row,
      amountWon: payNowAmountWon,
    });

    if (!discount) throw billingError(400, "COUPON_INVALID_DISCOUNT");

    payNowAmountWon = discount.finalAmount;
    coupon = {
      code: row.code,
      name: row.name,
      description: row.description,
      benefitType: row.benefitType,
      discountAmountWon: discount.discountAmount,
      discountPercent: row.discountPercent,
    };
    couponPayload = {
      couponId: row.id,
      code: row.code,
      discountAmount: discount.discountAmount,
      benefitType: row.benefitType,
    };
    discounts.push(coupon);
  }

  return {
    ...quote,
    payNowAmountWon,
    basePayNowAmountWon,
    promotion,
    coupon,
    couponPayload,
    discounts,
  };
}
