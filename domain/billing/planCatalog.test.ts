import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  getPlan,
  isPlanAvailableForPurchase,
  isPlanId,
  listPricingPlans,
} from "@/config/billing/plans";

test("public billing catalog exposes only Free plus Pro and Enterprise plans", () => {
  const plans = listPricingPlans();
  const publicPlanIds = plans.map((plan) => plan.id);

  assert.deepEqual(publicPlanIds, [
    "free_v1",
    "pro_monthly_v1",
    "enterprise_monthly_v1",
    "career_pro_v1",
    "career_enterprise_v1",
  ]);

  const paidPlans = plans.filter((plan) => plan.monthlyAmountWon > 0);
  assert.ok(paidPlans.every((plan) => ["PRO", "ENTERPRISE"].includes(getPlan(plan.id).planType)));
  assert.ok(paidPlans.every((plan) => plan.product === "PRESS" || plan.product === "CAREER"));
  assert.ok(!publicPlanIds.includes("standard_pro_v1"));
});

test("legacy plan ids remain valid but are not available for new purchase", () => {
  for (const planId of [
    "basic_monthly_v1",
    "career_basic_v1",
    "standard_pro_v1",
  ]) {
    assert.equal(isPlanId(planId), true);
    assert.equal(isPlanAvailableForPurchase(planId), false);
  }
});
