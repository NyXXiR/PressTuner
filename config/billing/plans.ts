import type { PlanType } from "@prisma/client";

import {
  BILLING_PLAN_CATALOG,
  type BillingPlanCatalogEntry,
  type CatalogAiQuotaPolicy,
  type CatalogAiQuotaSurface,
  type CatalogAiQuotaSurfacePolicy,
  type CatalogAiQuotaWindowKey,
  type CatalogAiQuotaWindowPolicy,
  type CatalogPlanCategory,
  type CatalogProductLine,
  type CatalogPlanPromotion,
  type CatalogPromotionDuration,
  type CatalogPromotionType,
  type CatalogQuotaPeriod,
} from "@/config/billing/plans.catalog";

export type PlanId = keyof typeof BILLING_PLANS;
export type QuotaPeriod = CatalogQuotaPeriod;
export type PromotionType = CatalogPromotionType;
export type PromotionDuration = CatalogPromotionDuration;
export type PlanPromotion = CatalogPlanPromotion;
export type PlanCategory = CatalogPlanCategory;
export type ProductLine = CatalogProductLine;
export type AiQuotaSurface = CatalogAiQuotaSurface;
export type AiQuotaWindowKey = CatalogAiQuotaWindowKey;
export type AiQuotaWindowPolicy = CatalogAiQuotaWindowPolicy;
export type AiQuotaSurfacePolicy = CatalogAiQuotaSurfacePolicy;
export type AiQuotaPolicy = CatalogAiQuotaPolicy;

export type BillingPlan = Omit<BillingPlanCatalogEntry, "planType"> & {
  planType: PlanType;
};

export const BILLING_PLANS = Object.fromEntries(
  BILLING_PLAN_CATALOG.map((plan) => [plan.id, plan]),
) as Record<string, BillingPlan>;

export function isPlanId(v: any): v is PlanId {
  return typeof v === "string" && v in BILLING_PLANS;
}

export function getPlan(planId: PlanId) {
  return BILLING_PLANS[planId];
}

export function getPlanProduct(planId: string): ProductLine | null {
  if (!isPlanId(planId)) return null;
  return getPlan(planId as PlanId).product;
}

export function requirePlanProduct(planId: PlanId): ProductLine {
  const product = getPlan(planId).product;
  if (!product) throw new Error("PLAN_PRODUCT_NOT_DEFINED");
  return product;
}

export function listPricingPlansByProduct(product: ProductLine) {
  return listPricingPlans().filter((plan) => plan.product === product);
}

export function getMonthlyAmountByPlanId(
  planId: string | null | undefined,
): number {
  if (!planId || !isPlanId(planId)) return 0;
  return getPlan(planId as PlanId).monthlyAmountWon;
}

export function isPlanAvailableForPurchase(planId: string | null | undefined) {
  if (!planId || !isPlanId(planId)) return false;
  return getPlan(planId as PlanId).availableForPurchase !== false;
}

export function formatAiQuotaSummary(
  plan: Pick<BillingPlan, "aiQuota">,
  surface: AiQuotaSurface,
): string {
  const surfacePolicy = plan.aiQuota[surface];
  if (surfacePolicy.unlimited) return "AI 사용량 무제한";

  const windows = surfacePolicy.windows;
  const fiveHour = windows.find((window) => window.key === "5h");
  const week = windows.find((window) => window.key === "1w");
  const format = (value: number) => value.toLocaleString("ko-KR");

  if (fiveHour && week) {
    return `AI 사용량 ${format(fiveHour.limitUnits)}유닛/5시간 · ${format(week.limitUnits)}유닛/7일`;
  }

  return windows
    .map((window) => `${format(window.limitUnits)}유닛/${window.label}`)
    .join(" · ");
}

export function hasUnlimitedPressUsage(
  plan: Pick<BillingPlan, "unlimitedPressUsage">,
) {
  return plan.unlimitedPressUsage === true;
}

function calculateDiscountedPrice(
  originalPrice: number,
  promo?: PlanPromotion,
) {
  if (!promo) return originalPrice;
  if (promo.type === "PERCENT") {
    return Math.floor(originalPrice * (1 - promo.value / 100));
  }
  if (promo.type === "FIXED_AMOUNT") {
    return Math.max(0, originalPrice - promo.value);
  }
  return originalPrice;
}

function generatePromotionLabel(promo: PlanPromotion): string {
  if (promo.label) return promo.label;
  if (promo.duration === "ONCE") {
    if (promo.type === "PERCENT") return `첫 달 ${promo.value}% 할인`;
    return `첫 달 ${promo.value.toLocaleString()}원 할인`;
  }
  return "특별 할인";
}

export function listPricingPlans() {
  return (Object.values(BILLING_PLANS) as BillingPlan[])
    .filter((plan) => plan.availableForPurchase !== false)
    .map((plan) => {
      const discountedPrice = calculateDiscountedPrice(
        plan.monthlyAmountWon,
        plan.promotion,
      );
      const promotionLabel = plan.promotion
        ? generatePromotionLabel(plan.promotion)
        : undefined;

      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        monthlyAmountWon: plan.monthlyAmountWon,
        discountedAmountWon: discountedPrice,
        promotionLabel,
        quotaArticleGenerates: plan.quotaArticleGenerates,
        quotaPeriod: plan.quotaPeriod,
        perBrief: plan.perBrief,
        perPolish: plan.perPolish,
        quotaArticle: plan.quotaArticle,
        quotaResume: plan.quotaResume,
        aiQuota: plan.aiQuota,
        category: plan.category,
        product: plan.product,
        blurb: plan.blurb,
        badge: plan.badge,
      };
    });
}

export function getPlanBadgeStyle(planType: string | null | undefined): string {
  const type = planType?.toUpperCase();
  switch (type) {
    case "PRO":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400";
    case "ENTERPRISE":
      return "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400";
    case "BASIC":
      return "bg-green-500/10 text-green-600 border-green-500/20 dark:bg-green-500/20 dark:text-green-400";
    case "FREE":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function getEffectiveMonthlyAmountByPlanId(
  planId: string | null | undefined,
): number {
  if (!planId) return 0;

  const plan = BILLING_PLANS[planId];
  if (!plan) return 0;

  if (!plan.promotion) return plan.monthlyAmountWon;

  if (plan.promotion.type === "PERCENT") {
    return Math.floor(
      plan.monthlyAmountWon * (1 - plan.promotion.value / 100),
    );
  }

  if (plan.promotion.type === "FIXED_AMOUNT") {
    return Math.max(0, plan.monthlyAmountWon - plan.promotion.value);
  }

  return plan.monthlyAmountWon;
}
