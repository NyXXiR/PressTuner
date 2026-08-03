-- Idempotent compatibility backfill from the legacy Team billing snapshot.
--
-- Safety rules:
-- - Only rows with an explicit plan ID and unambiguous PRESS/CAREER category move.
-- - Existing (team_id, product) rows are authoritative and are never overwritten.
-- - STANDARD/null-category legacy rows require manual classification.

INSERT INTO "team_product_subscription" (
  "id",
  "team_id",
  "product",
  "plan_id",
  "plan",
  "membership_status",
  "pay_provider",
  "billing_key",
  "next_payment_amount",
  "next_billing_at",
  "plan_expires_at",
  "pending_plan_id",
  "pending_plan",
  "pending_plan_starts_at",
  "cancel_requested_at",
  "last_payment_id",
  "last_paid_at",
  "created_at",
  "updated_at"
)
SELECT
  CONCAT('legacy_', "id", '_', LOWER("plan_category"::text)),
  "id",
  CASE
    WHEN "plan_category" = 'CAREER' THEN 'CAREER'::"ProductLine"
    ELSE 'PRESS'::"ProductLine"
  END,
  "plan_id",
  "plan",
  "membership_status",
  "pay_provider",
  "billing_key",
  COALESCE("next_payment_amount", 0),
  "next_billing_at",
  "plan_expires_at",
  "pending_plan_id",
  "pending_plan",
  "pending_plan_starts_at",
  "cancel_requested_at",
  "last_payment_id",
  "last_paid_at",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "team"
WHERE "plan_id" IS NOT NULL
  AND "plan_category" IN ('PRESS', 'CAREER')
  AND (
    NULLIF(current_setting('presstuner.backfill_team_id', true), '') IS NULL
    OR "id" = current_setting('presstuner.backfill_team_id', true)
  )
ON CONFLICT ("team_id", "product") DO NOTHING;
