import assert from "node:assert/strict";
import test from "node:test";

import { dateFromKst } from "@/domain/billing/teamMembership";
import { computeSubscriptionQuote } from "./policy";

test("computeSubscriptionQuote treats a cross-product plan as a separate purchase", () => {
  const result = computeSubscriptionQuote({
    targetPlanId: "career_basic_v1",
    now: dateFromKst(2026, 5, 2, 12, 0, 0),
    current: {
      planId: "basic_monthly_v1",
      plan: "BASIC",
      membershipStatus: "ACTIVE",
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
      pendingPlan: null,
      pendingPlanStartsAt: null,
    },
  });

  assert.equal(result.action, "PAY_NOW");
  assert.equal(result.payNowAmountWon, 5900);
  assert.equal(result.current.planId, null);
  assert.equal(result.target.planId, "career_basic_v1");
});

test("Career Pro to Career Enterprise uses the Career Pro price", () => {
  const result = computeSubscriptionQuote({
    targetPlanId: "career_enterprise_v1",
    now: dateFromKst(2026, 5, 2, 12, 0, 0),
    current: {
      planId: "career_pro_v1",
      plan: "PRO",
      membershipStatus: "ACTIVE",
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
      pendingPlan: null,
      pendingPlanStartsAt: null,
    },
  });

  assert.equal(result.action, "PAY_NOW");
  assert.equal(result.payNowAmountWon, 36100);
});
