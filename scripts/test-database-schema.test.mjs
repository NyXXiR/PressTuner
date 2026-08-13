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

test("test database schema contract includes AI Process Console producer tables", () => {
  for (const required of [
    ["ai_process_test_run", "command_hash"],
    ["ai_process_test_run", "fact_attempt_id"],
    ["ai_process_fact_outbox", "canonical_hash"],
    ["ai_process_fact_outbox", "next_attempt_at"],
    ["ai_process_fact_outbox", "delivered_at"],
    ["ai_process_producer_delivery_watermark", "last_successful_delivery_at"],
  ]) assert.ok(REQUIRED_TEST_DATABASE_COLUMNS.some(([table, column]) => table === required[0] && column === required[1]));
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
    "ai_process_test_run.command_hash",
    "ai_process_test_run.fact_attempt_id",
    "ai_process_fact_outbox.canonical_hash",
    "ai_process_fact_outbox.next_attempt_at",
    "ai_process_fact_outbox.delivered_at",
    "ai_process_producer_delivery_watermark.last_successful_delivery_at",
  ]);
});
