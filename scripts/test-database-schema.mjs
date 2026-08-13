export const REQUIRED_TEST_DATABASE_COLUMNS = Object.freeze([
  ["team_product_subscription", "product"],
  ["team_billing_history", "product"],
  ["team_billing_history", "subscription_id"],
  ["coupon_redemption", "product"],
  ["coupon_redemption", "subscription_id"],
  ["billing_webhook_event", "transmission_id"],
  ["subscription_change", "payment_status"],
  ["subscription_change", "apply_status"],
  ["agent_run", "runtime_policy_snapshot"],
  ["ai_process_test_run", "command_hash"],
  ["ai_process_test_run", "fact_attempt_id"],
  ["ai_process_fact_outbox", "canonical_hash"],
  ["ai_process_fact_outbox", "next_attempt_at"],
  ["ai_process_fact_outbox", "delivered_at"],
  ["ai_process_producer_delivery_watermark", "last_successful_delivery_at"],
]);

export function findMissingRequiredColumns(presentColumns) {
  return REQUIRED_TEST_DATABASE_COLUMNS.map(
    ([table, column]) => `${table}.${column}`,
  ).filter((column) => !presentColumns.has(column));
}
