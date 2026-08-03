import { prisma } from "@/lib/prisma";
import {
  BILLING_PLANS,
  getPlan,
  isPlanId,
  type BillingPlan,
  type PlanId,
} from "@/config/billing/plans";
import type {
  Coupon,
  CouponBenefitType,
  CouponStatus,
  Prisma,
  PlanCategory,
  PlanType,
} from "@prisma/client";

export type CouponValidationResult =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string };

type CouponClient = Pick<
  Prisma.TransactionClient,
  "coupon" | "couponRedemption"
>;

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

export async function findCouponByCode(
  code: string,
  client: CouponClient = prisma,
) {
  if (!code.trim()) return null;
  return client.coupon.findUnique({
    where: { code: normalizeCouponCode(code) },
  });
}

function isActiveStatus(status: CouponStatus) {
  return status === "ACTIVE";
}

function isWithinValidity(coupon: Coupon, now: Date) {
  if (coupon.validFrom && now < coupon.validFrom) return false;
  if (coupon.validTo && now > coupon.validTo) return false;
  return true;
}

async function checkRedemptionLimits(
  coupon: Coupon,
  userId?: string | null,
  client: CouponClient = prisma,
) {
  if (coupon.maxRedemptions != null) {
    const used = await client.couponRedemption.count({
      where: {
        couponId: coupon.id,
        status: { not: "CANCELED" },
      },
    });
    if (used >= coupon.maxRedemptions) return "COUPON_EXHAUSTED";
  }

  if (coupon.maxRedemptionsPerUser != null && userId) {
    const used = await client.couponRedemption.count({
      where: {
        couponId: coupon.id,
        userId,
        status: { not: "CANCELED" },
      },
    });
    if (used >= coupon.maxRedemptionsPerUser) return "COUPON_USER_LIMIT";
  }

  return null;
}

function applyPlanFilters(coupon: Coupon, plan: BillingPlan) {
  if (coupon.applicablePlanIds?.length) {
    if (!coupon.applicablePlanIds.includes(plan.id)) {
      return "COUPON_NOT_APPLICABLE_PLAN";
    }
  }

  if (coupon.applicablePlanTypes?.length) {
    if (!coupon.applicablePlanTypes.includes(plan.planType as PlanType)) {
      return "COUPON_NOT_APPLICABLE_PLAN_TYPE";
    }
  }

  if (coupon.applicablePlanCategories?.length) {
    if (!coupon.applicablePlanCategories.includes(plan.category as PlanCategory)) {
      return "COUPON_NOT_APPLICABLE_CATEGORY";
    }
  }

  return null;
}

export async function validateCoupon(params: {
  code: string;
  now?: Date;
  userId?: string | null;
  client?: CouponClient;
}): Promise<CouponValidationResult> {
  const now = params.now ?? new Date();
  const client = params.client ?? prisma;
  const coupon = await findCouponByCode(params.code, client);
  if (!coupon) return { ok: false, error: "COUPON_NOT_FOUND" };

  if (!isActiveStatus(coupon.status)) {
    return { ok: false, error: "COUPON_INACTIVE" };
  }
  if (!isWithinValidity(coupon, now)) {
    return { ok: false, error: "COUPON_EXPIRED" };
  }

  const limitError = await checkRedemptionLimits(
    coupon,
    params.userId,
    client,
  );
  if (limitError) return { ok: false, error: limitError };

  return { ok: true, coupon };
}

export function resolveGrantPlan(coupon: Coupon): BillingPlan | null {
  if (!coupon.grantPlanId || !isPlanId(coupon.grantPlanId)) {
    return null;
  }

  return getPlan(coupon.grantPlanId as PlanId);
}

export function computeDiscount(params: {
  coupon: Coupon;
  amountWon: number;
}) {
  const amount = Math.max(0, params.amountWon);
  const coupon = params.coupon;

  if (coupon.benefitType === "PERCENT") {
    const value = coupon.discountPercent ?? 0;
    const discount = Math.floor((amount * value) / 100);
    return {
      discountAmount: Math.min(amount, discount),
      finalAmount: Math.max(0, amount - discount),
    };
  }

  if (coupon.benefitType === "FIXED_AMOUNT") {
    const discount = coupon.discountAmount ?? 0;
    return {
      discountAmount: Math.min(amount, discount),
      finalAmount: Math.max(0, amount - discount),
    };
  }

  return null;
}

export async function validateCouponForPlan(params: {
  code: string;
  plan: BillingPlan;
  amountWon?: number;
  userId?: string | null;
  now?: Date;
  client?: CouponClient;
}): Promise<CouponValidationResult> {
  const base = await validateCoupon({
    code: params.code,
    now: params.now,
    userId: params.userId,
    client: params.client,
  });

  if (!base.ok) return base;

  const coupon = base.coupon;
  const planError = applyPlanFilters(coupon, params.plan);
  if (planError) return { ok: false, error: planError };

  if (params.amountWon != null && coupon.minAmount != null) {
    if (params.amountWon < coupon.minAmount) {
      return { ok: false, error: "COUPON_MIN_AMOUNT" };
    }
  }

  return { ok: true, coupon };
}

export function isDiscountCoupon(type: CouponBenefitType) {
  return type === "PERCENT" || type === "FIXED_AMOUNT";
}
