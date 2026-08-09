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
  ["press_ai_debug_case", "topology_config"],
  ["press_ai_debug_attempt", "topology_snapshot"],
  ["press_ai_debug_attempt", "guardrail_snapshot"],
  ["press_ai_debug_checkpoint", "iteration"],
  ["press_ai_debug_transition", "evaluation_state"],
  ["press_ai_debug_guardrail_observation", "evaluation_status"],
]);

export function findMissingRequiredColumns(presentColumns) {
  return REQUIRED_TEST_DATABASE_COLUMNS.map(
    ([table, column]) => `${table}.${column}`,
  ).filter((column) => !presentColumns.has(column));
}
