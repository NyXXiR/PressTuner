import { getPlanProduct, isPlanId, type PlanId } from "@/config/billing/plans";

export const PRESS_PRODUCT = "PRESS" as const;
export const PRESS_SURFACE = "PRESS" as const;

export function isPressPlanId(value: unknown): value is PlanId {
  return isPlanId(value) && getPlanProduct(value) === PRESS_PRODUCT;
}
