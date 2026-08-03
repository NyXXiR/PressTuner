-- Add product-aware billing audit columns and a durable PortOne webhook inbox.

ALTER TYPE "BillingProvider" ADD VALUE IF NOT EXISTS 'PORTONE';

DO $$
BEGIN
  CREATE TYPE "BillingWebhookProcessingStatus" AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'PROCESSED',
    'FAILED',
    'RETRYABLE',
    'IGNORED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "coupon_redemption"
  ADD COLUMN IF NOT EXISTS "product" "ProductLine",
  ADD COLUMN IF NOT EXISTS "subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "before_plan_id" TEXT,
  ADD COLUMN IF NOT EXISTS "after_plan_id" TEXT,
  ADD COLUMN IF NOT EXISTS "before_status" "MembershipStatus",
  ADD COLUMN IF NOT EXISTS "after_status" "MembershipStatus";

ALTER TABLE "team_billing_history"
  ADD COLUMN IF NOT EXISTS "product" "ProductLine",
  ADD COLUMN IF NOT EXISTS "subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "before_plan_id" TEXT,
  ADD COLUMN IF NOT EXISTS "after_plan_id" TEXT,
  ADD COLUMN IF NOT EXISTS "before_status" "MembershipStatus",
  ADD COLUMN IF NOT EXISTS "after_status" "MembershipStatus";

ALTER TABLE "billing_webhook_event"
  ADD COLUMN IF NOT EXISTS "status" "BillingWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "event_occurred_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "team_id" TEXT,
  ADD COLUMN IF NOT EXISTS "product" "ProductLine",
  ADD COLUMN IF NOT EXISTS "subscription_id" TEXT;

ALTER TABLE "billing_webhook_event"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

UPDATE "billing_webhook_event"
SET "updated_at" = COALESCE("event_occurred_at", CURRENT_TIMESTAMP)
WHERE "updated_at" IS NULL;

ALTER TABLE "billing_webhook_event"
  ALTER COLUMN "updated_at" SET NOT NULL;

-- Prefer explicit audit metadata from product-aware writes.
UPDATE "team_billing_history"
SET "product" = ("meta"->>'product')::"ProductLine"
WHERE "product" IS NULL
  AND "meta"->>'product' IN ('PRESS', 'CAREER');

UPDATE "team_billing_history"
SET "subscription_id" = NULLIF("meta"->>'subscriptionId', '')
WHERE "subscription_id" IS NULL
  AND NULLIF("meta"->>'subscriptionId', '') IS NOT NULL;

UPDATE "team_billing_history"
SET
  "before_plan_id" = COALESCE(NULLIF("meta"->>'previousPlanId', ''), NULLIF("meta"->>'beforePlanId', '')),
  "after_plan_id" = COALESCE(NULLIF("meta"->>'targetPlanId', ''), NULLIF("meta"->>'grantedPlanId', ''), NULLIF("meta"->>'afterPlanId', ''), "plan_id")
WHERE "before_plan_id" IS NULL OR "after_plan_id" IS NULL;

UPDATE "team_billing_history"
SET "before_status" = ("meta"->>'beforeStatus')::"MembershipStatus"
WHERE "before_status" IS NULL
  AND "meta"->>'beforeStatus' IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

UPDATE "team_billing_history"
SET "after_status" = ("meta"->>'afterStatus')::"MembershipStatus"
WHERE "after_status" IS NULL
  AND "meta"->>'afterStatus' IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

UPDATE "coupon_redemption"
SET "product" = ("meta"->>'product')::"ProductLine"
WHERE "product" IS NULL
  AND "meta"->>'product' IN ('PRESS', 'CAREER');

UPDATE "coupon_redemption"
SET
  "before_plan_id" = COALESCE(NULLIF("meta"->>'previousPlanId', ''), NULLIF("meta"->>'beforePlanId', '')),
  "after_plan_id" = COALESCE(NULLIF("meta"->>'grantedPlanId', ''), NULLIF("meta"->>'afterPlanId', ''))
WHERE "before_plan_id" IS NULL OR "after_plan_id" IS NULL;

-- Resolve subscription identity from an explicit product.
UPDATE "team_billing_history" AS history
SET "subscription_id" = subscription."id"
FROM "team_product_subscription" AS subscription
WHERE history."subscription_id" IS NULL
  AND history."product" IS NOT NULL
  AND subscription."team_id" = history."team_id"
  AND subscription."product" = history."product";

UPDATE "coupon_redemption" AS redemption
SET "subscription_id" = subscription."id"
FROM "team_product_subscription" AS subscription
WHERE redemption."subscription_id" IS NULL
  AND redemption."team_id" IS NOT NULL
  AND redemption."product" IS NOT NULL
  AND subscription."team_id" = redemption."team_id"
  AND subscription."product" = redemption."product";

-- Backfill only teams with exactly one product row; dual-product history remains ambiguous.
WITH unique_subscription AS (
  SELECT
    "team_id",
    MIN("id") AS "subscription_id",
    MIN("product"::text)::"ProductLine" AS "product"
  FROM "team_product_subscription"
  GROUP BY "team_id"
  HAVING COUNT(*) = 1
)
UPDATE "team_billing_history" AS history
SET
  "product" = COALESCE(history."product", unique_subscription."product"),
  "subscription_id" = COALESCE(history."subscription_id", unique_subscription."subscription_id")
FROM unique_subscription
WHERE history."team_id" = unique_subscription."team_id"
  AND (history."product" IS NULL OR history."subscription_id" IS NULL);

WITH unique_subscription AS (
  SELECT
    "team_id",
    MIN("id") AS "subscription_id",
    MIN("product"::text)::"ProductLine" AS "product"
  FROM "team_product_subscription"
  GROUP BY "team_id"
  HAVING COUNT(*) = 1
)
UPDATE "coupon_redemption" AS redemption
SET
  "product" = COALESCE(redemption."product", unique_subscription."product"),
  "subscription_id" = COALESCE(redemption."subscription_id", unique_subscription."subscription_id")
FROM unique_subscription
WHERE redemption."team_id" = unique_subscription."team_id"
  AND (redemption."product" IS NULL OR redemption."subscription_id" IS NULL);

CREATE INDEX IF NOT EXISTS "coupon_redemption_team_id_product_applied_at_idx"
  ON "coupon_redemption"("team_id", "product", "applied_at");
CREATE INDEX IF NOT EXISTS "coupon_redemption_subscription_id_applied_at_idx"
  ON "coupon_redemption"("subscription_id", "applied_at");
CREATE INDEX IF NOT EXISTS "team_billing_history_team_id_product_occurred_at_idx"
  ON "team_billing_history"("team_id", "product", "occurred_at");
CREATE INDEX IF NOT EXISTS "team_billing_history_subscription_id_occurred_at_idx"
  ON "team_billing_history"("subscription_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "billing_webhook_event_status_next_retry_at_idx"
  ON "billing_webhook_event"("status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "billing_webhook_event_payment_id_event_occurred_at_idx"
  ON "billing_webhook_event"("payment_id", "event_occurred_at");
