import assert from "node:assert/strict";
import test from "node:test";

import { dateFromKst } from "@/domain/billing/teamMembership";
import { evaluateSubscriptionLifecycle } from "./lifecycleMatrix";

test("lifecycle matrix allows cancel and payment-method change for an active paid admin", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "PRO",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      hasBillingKey: true,
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
    },
    {
      now: dateFromKst(2026, 5, 1, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.state, "ACTIVE");
  assert.equal(result.canUseProduct, true);
  assert.equal(result.actions.cancelSubscription.allowed, true);
  assert.equal(result.actions.changePaymentMethod.allowed, true);
  assert.equal(result.actions.recoverPastDue.allowed, false);
  assert.equal(result.actions.uncancelSubscription.allowed, false);
});

test("lifecycle matrix treats a free team as non-cancelable but usable", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "FREE",
      membershipStatus: "ACTIVE",
    },
    {
      now: dateFromKst(2026, 5, 1, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.state, "FREE");
  assert.equal(result.canUseProduct, true);
  assert.equal(result.actions.cancelSubscription.allowed, false);
  assert.equal(result.actions.cancelSubscription.reason, "FREE_PLAN");
  assert.equal(result.actions.changePaymentMethod.allowed, false);
});

test("lifecycle matrix allows uncancel only while the canceled cycle is still active and a billing method exists", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "PRO",
      membershipStatus: "CANCELED",
      payProvider: "INICIS",
      hasBillingKey: true,
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
      cancelRequestedAt: dateFromKst(2026, 5, 1, 9, 0, 0),
    },
    {
      now: dateFromKst(2026, 5, 2, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.state, "CANCELED_ACTIVE");
  assert.equal(result.canUseProduct, true);
  assert.equal(result.actions.cancelSubscription.allowed, false);
  assert.equal(result.actions.uncancelSubscription.allowed, true);
  assert.equal(result.actions.changePaymentMethod.allowed, true);
});

test("lifecycle matrix blocks uncancel when a canceled team has no billing method", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "PRO",
      membershipStatus: "CANCELED",
      payProvider: null,
      hasBillingKey: false,
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
      cancelRequestedAt: dateFromKst(2026, 5, 1, 9, 0, 0),
    },
    {
      now: dateFromKst(2026, 5, 2, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.actions.uncancelSubscription.allowed, false);
  assert.equal(result.actions.uncancelSubscription.reason, "NO_BILLING_METHOD");
});

test("lifecycle matrix exposes pending downgrade actions separately from plain active state", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "PRO",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      hasBillingKey: true,
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
      pendingPlan: "BASIC",
      pendingPlanId: "basic_monthly_v1",
      pendingPlanStartsAt: dateFromKst(2026, 5, 10, 0, 0, 0),
    },
    {
      now: dateFromKst(2026, 5, 2, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.state, "ACTIVE_PENDING_DOWNGRADE");
  assert.equal(result.actions.unscheduleDowngrade.allowed, true);
  assert.equal(result.actions.cancelSubscription.allowed, true);
});

test("lifecycle matrix keeps past-due teams usable until expiry while allowing payment-method changes", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "BASIC",
      membershipStatus: "PAST_DUE",
      payProvider: "INICIS",
      hasBillingKey: true,
      planExpiresAt: dateFromKst(2026, 5, 10, 0, 0, 0),
    },
    {
      now: dateFromKst(2026, 5, 2, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.state, "PAST_DUE");
  assert.equal(result.canUseProduct, true);
  assert.equal(result.actions.cancelSubscription.allowed, true);
  assert.equal(result.actions.changePaymentMethod.allowed, true);
  assert.equal(result.actions.recoverPastDue.allowed, true);
});

test("lifecycle matrix blocks paid-plan management after expiry", () => {
  const result = evaluateSubscriptionLifecycle(
    {
      plan: "PRO",
      membershipStatus: "ACTIVE",
      payProvider: "INICIS",
      hasBillingKey: true,
      planExpiresAt: dateFromKst(2026, 5, 1, 0, 0, 0),
    },
    {
      now: dateFromKst(2026, 5, 1, 12, 0, 0),
      isAdmin: true,
    },
  );

  assert.equal(result.state, "EXPIRED");
  assert.equal(result.canUseProduct, false);
  assert.equal(result.actions.cancelSubscription.allowed, false);
  assert.equal(result.actions.changePaymentMethod.allowed, false);
  assert.equal(result.actions.recoverPastDue.allowed, false);
});
