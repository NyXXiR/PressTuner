import { getPlanProduct, isPlanId, type PlanId } from "@/config/billing/plans";

export const CAREER_PRODUCT = "CAREER" as const;
export const CAREER_SURFACE = "RESUME" as const;

export function isCareerPlanId(value: unknown): value is PlanId {
  return isPlanId(value) && getPlanProduct(value) === CAREER_PRODUCT;
}
