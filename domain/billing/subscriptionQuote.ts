// src/billing/subscriptionQuote.ts
import { BILLING_PLANS, type PlanId } from "@/config/billing/plans";

/**
 * 구독 청구 계획(초회/다음 결제 시점)
 * - 지금은 "월 구독"만
 * - 프로모션 넣을 때 이 객체만 확장/교체하면 됨
 */
export type SubscriptionQuote = {
  planId: PlanId;

  // 초회 청구 금액 (0 가능: 무료체험)
  firstChargeAmountWon: number;

  // 초회 주문명 (영수증/내역 가독성)
  firstOrderName: string;

  // 다음 결제 예정일 (무료체험이면 여기로)
  nextBillingAt: Date;

  // 메타(나중에 프로모션/사유 추적)
  meta: Record<string, unknown>;
};

type QuoteInput = {
  planId: PlanId;
  now?: Date;

  // TODO: 확장 포인트들
  // teamId?: string;
  // userId?: string;
  // promoCode?: string | null;
};

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function buildSubscriptionQuote(input: QuoteInput): SubscriptionQuote {
  const now = input.now ?? new Date();
  const plan = BILLING_PLANS[input.planId];

  // 기본: 즉시 1개월 결제 + 다음달 갱신
  const base: SubscriptionQuote = {
    planId: input.planId,
    firstChargeAmountWon: plan.monthlyAmountWon,
    firstOrderName: `brieFFlow ${plan.name} 월 구독`,
    nextBillingAt: addMonths(now, 1),
    meta: { v: 1, policy: "BASE_MONTHLY" },
  };

  // ----------------------------
  // ✅ 확장 예시(원할 때 주석 해제/정책 추가)
  // ----------------------------

  // 1) 첫 달 무료(초회 0원, nextBillingAt = +1month)
  // const firstMonthFreeEligible = false; // TODO: DB로 "첫 구독인지" 판단
  // if (firstMonthFreeEligible) {
  //   return {
  //     ...base,
  //     firstChargeAmountWon: 0,
  //     firstOrderName: `brieFFlow ${plan.name} 무료체험(1개월)`,
  //     nextBillingAt: addMonths(now, 1),
  //     meta: { ...base.meta, policy: "TRIAL_1M_FREE" },
  //   };
  // }

  // 2) 첫 달 1000원 프로모션(초회 1000원, 다음달부터 정상가)
  // const promo1000Eligible = false; // TODO
  // if (promo1000Eligible) {
  //   return {
  //     ...base,
  //     firstChargeAmountWon: 1000,
  //     firstOrderName: `brieFFlow ${plan.name} 첫 달 프로모션`,
  //     nextBillingAt: addMonths(now, 1),
  //     meta: { ...base.meta, policy: "INTRO_1000" },
  //   };
  // }

  return base;
}
