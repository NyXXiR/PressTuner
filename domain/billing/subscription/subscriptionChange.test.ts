import assert from "node:assert/strict";
import test from "node:test";

import {
  createSubscriptionChangeState,
  transitionSubscriptionChange,
} from "./subscriptionChange";

test("paid subscription change separates provider confirmation from local apply", () => {
  const pending = createSubscriptionChangeState({ paymentRequired: true });
  assert.deepEqual(pending, {
    paymentStatus: "PENDING",
    applyStatus: "PENDING",
  });

  const confirmed = transitionSubscriptionChange(pending, {
    type: "PAYMENT_CONFIRMED",
  });
  const applyFailed = transitionSubscriptionChange(confirmed, {
    type: "APPLY_FAILED",
  });

  assert.deepEqual(applyFailed, {
    paymentStatus: "CONFIRMED",
    applyStatus: "FAILED",
  });
  assert.deepEqual(
    transitionSubscriptionChange(applyFailed, { type: "APPLY_SUCCEEDED" }),
    { paymentStatus: "CONFIRMED", applyStatus: "APPLIED" },
  );
});

test("provider failure cannot be mistaken for a local apply failure", () => {
  const pending = createSubscriptionChangeState({ paymentRequired: true });
  assert.deepEqual(
    transitionSubscriptionChange(pending, { type: "PAYMENT_FAILED" }),
    { paymentStatus: "FAILED", applyStatus: "PENDING" },
  );
  assert.throws(
    () => transitionSubscriptionChange(pending, { type: "APPLY_SUCCEEDED" }),
    /SUBSCRIPTION_CHANGE_ILLEGAL_TRANSITION/,
  );
});

test("no-charge change can apply without fabricating a provider payment", () => {
  const pending = createSubscriptionChangeState({ paymentRequired: false });
  assert.deepEqual(pending, {
    paymentStatus: "NOT_REQUIRED",
    applyStatus: "PENDING",
  });
  assert.deepEqual(
    transitionSubscriptionChange(pending, { type: "APPLY_SUCCEEDED" }),
    { paymentStatus: "NOT_REQUIRED", applyStatus: "APPLIED" },
  );
});

test("compensation is legal only after confirmed payment and failed apply", () => {
  const failedApply = {
    paymentStatus: "CONFIRMED" as const,
    applyStatus: "FAILED" as const,
  };
  const pendingCompensation = transitionSubscriptionChange(failedApply, {
    type: "COMPENSATION_REQUIRED",
  });
  assert.deepEqual(pendingCompensation, {
    paymentStatus: "CONFIRMED",
    applyStatus: "COMPENSATION_PENDING",
  });
  assert.deepEqual(
    transitionSubscriptionChange(pendingCompensation, {
      type: "COMPENSATED",
    }),
    { paymentStatus: "REFUNDED", applyStatus: "COMPENSATED" },
  );
  assert.throws(
    () =>
      transitionSubscriptionChange(
        createSubscriptionChangeState({ paymentRequired: true }),
        { type: "COMPENSATION_REQUIRED" },
      ),
    /SUBSCRIPTION_CHANGE_ILLEGAL_TRANSITION/,
  );
});
