// domain/billing/subscription/quote.ts
import {
  isPlanId,
  type PlanId,
  getPlan,
  getMonthlyAmountByPlanId,
} from "@/config/billing/plans";
import type { PlanType } from "@prisma/client";
import { planTier } from "@/domain/billing/teamMembership";

export type SubscriptionQuoteAction = "PAY_NOW" | "SCHEDULE_DOWNGRADE" | "NOOP";

export function computeSubscriptionQuote(args: {
  currentPlanId?: string | null;
  currentPlanType: PlanType;
  currentExpiresAtExclusive: Date | null;
  targetPlanId: string;
  now?: Date;
}):
  | {
      ok: true;
      action: SubscriptionQuoteAction;
      payNowAmountWon: number;
      target: {
        planId: string;
        planType: PlanType;
        monthlyAmountWon: number;
        name: string;
      };
      note: string;
    }
  | { ok: false; error: "INVALID_TARGET_PLAN" } {
  const now = args.now ?? new Date();
  if (!isPlanId(args.targetPlanId))
    return { ok: false, error: "INVALID_TARGET_PLAN" };

  const target = getPlan(args.targetPlanId as PlanId);
  const targetPlanType = target.planType as PlanType;

  const tierNow = planTier(args.currentPlanType);
  const tierTarget = planTier(targetPlanType);

  const hasActiveCycle =
    !!args.currentExpiresAtExclusive &&
    now.getTime() < args.currentExpiresAtExclusive.getTime();

  let action: SubscriptionQuoteAction = "PAY_NOW";
  let payNowAmountWon = 0;

  const currentMonthlyWon = getMonthlyAmountByPlanId(args.currentPlanId);

  if (
    tierTarget < tierNow &&
    hasActiveCycle &&
    args.currentExpiresAtExclusive
  ) {
    action = "SCHEDULE_DOWNGRADE";
    payNowAmountWon = 0;
  } else if (hasActiveCycle && tierTarget > tierNow) {
    // ✅ 업그레이드: proration 제거 → 월 가격 차이만 결제
    action = "PAY_NOW";
    payNowAmountWon = Math.max(0, target.monthlyAmountWon - currentMonthlyWon);
  } else if (hasActiveCycle && tierTarget === tierNow) {
    action = "PAY_NOW";
    payNowAmountWon = target.monthlyAmountWon;
  } else {
    action = "PAY_NOW";
    payNowAmountWon = target.monthlyAmountWon;
  }

  return {
    ok: true,
    action,
    payNowAmountWon,
    target: {
      planId: args.targetPlanId,
      planType: targetPlanType,
      monthlyAmountWon: target.monthlyAmountWon,
      name: target.name,
    },
    note: "SUBSCRIPTION_QUOTE",
  };
}
