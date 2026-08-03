import test from "node:test";
import assert from "node:assert/strict";

import { dateFromKst } from "@/domain/billing/teamMembership";
import {
  buildCancelSubscriptionPatch,
  buildExpiredToFreePatch,
  buildImmediateUpgradePatch,
  buildPendingPlanActivationPatch,
  buildRecurringRenewalPatch,
  buildScheduledDowngradePatch,
  buildUncancelSubscriptionPatch,
} from "./lifecycle";

test("buildRecurringRenewalPatch extends the current cycle and schedules the next charge before expiry", () => {
  const currentPlanExpiresAt = dateFromKst(2026, 5, 1, 0, 0, 0);
  const now = dateFromKst(2026, 4, 29, 9, 0, 0);

  const patch = buildRecurringRenewalPatch({
    targetPlanId: "career_pro_v1",
    currentPlanExpiresAt,
    now,
  });

  assert.equal(patch.plan, "PRO");
  assert.equal(patch.planId, "career_pro_v1");
  assert.equal(patch.planCategory, "CAREER");
  assert.equal(patch.nextPaymentAmount, 12900);
  assert.equal(
    patch.planExpiresAt?.toISOString(),
    dateFromKst(2026, 6, 1, 0, 0, 0).toISOString(),
  );
  assert.equal(
    patch.nextBillingAt?.toISOString(),
    dateFromKst(2026, 5, 30, 10, 0, 0).toISOString(),
  );
  assert.equal(patch.pendingPlanId, null);
  assert.equal(patch.pendingPlanStartsAt, null);
  assert.equal(patch.usageResumeMonthly, 0);
});

test("buildImmediateUpgradePatch syncs plan snapshot fields and restores next billing when reactivating", () => {
  const planExpiresAt = dateFromKst(2026, 7, 1, 0, 0, 0);

  const patch = buildImmediateUpgradePatch({
    targetPlanId: "standard_pro_v1",
    planExpiresAt,
    nextBillingAt: null,
    payProvider: "INICIS",
    billingKey: "billing-key-1",
  });

  assert.equal(patch.plan, "PRO");
  assert.equal(patch.planCategory, "STANDARD");
  assert.equal(patch.membershipStatus, "ACTIVE");
  assert.equal(patch.payProvider, "INICIS");
  assert.equal(patch.billingKey, "billing-key-1");
  assert.equal(patch.nextPaymentAmount, 39000);
  assert.equal(
    patch.nextBillingAt?.toISOString(),
    dateFromKst(2026, 6, 29, 10, 0, 0).toISOString(),
  );
  assert.equal(patch.cancelRequestedAt, null);
});

test("buildScheduledDowngradePatch stores pending plan metadata and the target cycle amount", () => {
  const planExpiresAt = dateFromKst(2026, 7, 1, 0, 0, 0);

  const patch = buildScheduledDowngradePatch({
    targetPlanId: "basic_monthly_v1",
    planExpiresAt,
  });

  assert.equal(patch.pendingPlan, "BASIC");
  assert.equal(patch.pendingPlanId, "basic_monthly_v1");
  assert.equal(patch.pendingPlanStartsAt?.toISOString(), planExpiresAt.toISOString());
  assert.equal(patch.nextPaymentAmount, 9900);
});

test("buildCancelSubscriptionPatch and buildUncancelSubscriptionPatch preserve access window semantics", () => {
  const planExpiresAt = dateFromKst(2026, 7, 1, 0, 0, 0);
  const now = dateFromKst(2026, 5, 3, 12, 30, 0);

  const cancelPatch = buildCancelSubscriptionPatch({
    planExpiresAt,
    nextBillingAt: null,
    now,
  });

  assert.equal(cancelPatch.membershipStatus, "CANCELED");
  assert.equal(cancelPatch.cancelRequestedAt?.toISOString(), now.toISOString());
  assert.equal(
    cancelPatch.nextBillingAt?.toISOString(),
    dateFromKst(2026, 6, 29, 10, 0, 0).toISOString(),
  );
  assert.equal(cancelPatch.pendingPlanId, null);

  const uncancelPatch = buildUncancelSubscriptionPatch({
    planExpiresAt,
    nextBillingAt: null,
  });

  assert.equal(uncancelPatch.membershipStatus, "ACTIVE");
  assert.equal(uncancelPatch.cancelRequestedAt, null);
  assert.equal(
    uncancelPatch.nextBillingAt?.toISOString(),
    dateFromKst(2026, 6, 29, 10, 0, 0).toISOString(),
  );
});

test("buildPendingPlanActivationPatch applies the scheduled plan snapshot without resetting usage", () => {
  const patch = buildPendingPlanActivationPatch({
    planId: "career_basic_v1",
  });

  assert.equal(patch.plan, "BASIC");
  assert.equal(patch.planCategory, "CAREER");
  assert.equal(patch.nextPaymentAmount, 5900);
  assert.equal(patch.limitArticleMonthly, 3);
  assert.equal(patch.limitResumeMonthly, 150);
  assert.equal(patch.pendingPlanId, null);
});

test("buildExpiredToFreePatch clears billing state for expired paid subscriptions", () => {
  const patch = buildExpiredToFreePatch();

  assert.equal(patch.plan, "FREE");
  assert.equal(patch.planId, "free_v1");
  assert.equal(patch.planCategory, "STANDARD");
  assert.equal(patch.membershipStatus, "ACTIVE");
  assert.equal(patch.planExpiresAt, null);
  assert.equal(patch.nextBillingAt, null);
  assert.equal(patch.nextPaymentAmount, 0);
  assert.equal(patch.billingKey, null);
  assert.equal(patch.payProvider, null);
  assert.equal(patch.cancelRequestedAt, null);
  assert.equal(patch.usageArticleMonthly, 0);
  assert.equal(patch.usageResumeMonthly, 0);
});
