import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_TEST_DATABASE_COLUMNS,
  findMissingRequiredColumns,
} from "./test-database-schema.mjs";

test("test database schema contract includes the Agent runtime policy snapshot", () => {
  assert.ok(
    REQUIRED_TEST_DATABASE_COLUMNS.some(
      ([table, column]) =>
        table === "agent_run" && column === "runtime_policy_snapshot",
    ),
  );
});

test("schema parity reports every required column missing from the database", () => {
  const present = new Set([
    "team_product_subscription.product",
    "team_billing_history.product",
  ]);

  assert.deepEqual(findMissingRequiredColumns(present), [
    "team_billing_history.subscription_id",
    "coupon_redemption.product",
    "coupon_redemption.subscription_id",
    "billing_webhook_event.transmission_id",
    "subscription_change.payment_status",
    "subscription_change.apply_status",
    "agent_run.runtime_policy_snapshot",
  ]);
});
