// src/domain/billing/subscription/policy.ts
import {
  getPlan,
  getMonthlyAmountByPlanId,
  getPlanProduct,
  type PlanId,
} from "@/config/billing/plans";
import type { PlanType } from "@prisma/client";
import { planTier } from "@/domain/billing/teamMembership";

export type SubscriptionQuoteAction =
  | "PAY_NOW"
  | "SCHEDULE_DOWNGRADE"
  | "SCHEDULE_CHANGE"
  | "NOOP";

export type SubscriptionQuote = {
  action: SubscriptionQuoteAction;
  payNowAmountWon: number;
  target: {
    planId: string;
    planType: string;
    monthlyAmountWon: number;
    name: string;
  };
  current: {
    planId: string | null;
    planType: string;
    membershipStatus: string;
    planExpiresAt: Date | null;
    pendingPlan: string | null;
    pendingPlanStartsAt: Date | null;
  };
  note: string;
};

export function computeSubscriptionQuote(args: {
  targetPlanId: PlanId;
  now?: Date;
  current: {
    planId: string | null;
    plan: PlanType;
    membershipStatus: string;
    planExpiresAt: Date | null;
    pendingPlan: string | null;
    pendingPlanStartsAt: Date | null;
  };
}): SubscriptionQuote {
  const now = args.now ?? new Date();

  const target = getPlan(args.targetPlanId);
  const targetPlanType = target.planType as PlanType;

  const sameProduct =
    !!target.product && getPlanProduct(args.current.planId ?? "") === target.product;
  const currentPlanId = sameProduct ? args.current.planId : null;
  const currentPlanType = (sameProduct ? args.current.plan : "FREE") as PlanType;
  const isSamePlanId = currentPlanId === args.targetPlanId;

  const tierNow = planTier(currentPlanType);
  const tierTarget = planTier(targetPlanType);

  const expiresAtExclusive = args.current.planExpiresAt ?? null;
  const hasActiveCycle =
    sameProduct && !!expiresAtExclusive && now.getTime() < expiresAtExclusive.getTime();

  let action: SubscriptionQuoteAction = "PAY_NOW";
  let payNowAmountWon = 0;

  const currentMonthlyWon = getMonthlyAmountByPlanId(currentPlanId);

  if (tierTarget < tierNow && hasActiveCycle && expiresAtExclusive) {
    action = "SCHEDULE_DOWNGRADE";
    payNowAmountWon = 0;
  } else if (hasActiveCycle && tierTarget === tierNow && !isSamePlanId) {
    action = "SCHEDULE_CHANGE";
    payNowAmountWon = 0;
  } else if (hasActiveCycle && tierTarget > tierNow) {
    action = "PAY_NOW";
    // ✅ 업그레이드: 남은 기간 proration 제거 → 월 가격 차이만 결제
    payNowAmountWon = Math.max(0, target.monthlyAmountWon - currentMonthlyWon);
  } else if (hasActiveCycle && tierTarget === tierNow) {
    action = "PAY_NOW";
    payNowAmountWon = target.monthlyAmountWon;
  } else {
    action = "PAY_NOW";
    payNowAmountWon = target.monthlyAmountWon;
  }

  // 같은 planId + 같은 tier면 사실상 NOOP(화면 표시용)
  if (isSamePlanId && tierTarget === tierNow && targetPlanType === currentPlanType) {
    if (payNowAmountWon === 0) action = "NOOP";
  }

  return {
    action,
    payNowAmountWon,
    target: {
      planId: args.targetPlanId,
      planType: targetPlanType,
      monthlyAmountWon: target.monthlyAmountWon,
      name: target.name,
    },
    current: {
      planId: currentPlanId,
      planType: currentPlanType,
      membershipStatus: args.current.membershipStatus,
      planExpiresAt: args.current.planExpiresAt ?? null,
      pendingPlan: args.current.pendingPlan ?? null,
      pendingPlanStartsAt: args.current.pendingPlanStartsAt ?? null,
    },
    note: "SUBSCRIPTION_QUOTE",
  };
}
