-- Add the durable subscription-change operation log used by payment recovery.

DO $$
BEGIN
  CREATE TYPE "SubscriptionChangePaymentStatus" AS ENUM (
    'NOT_REQUIRED', 'PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SubscriptionChangeApplyStatus" AS ENUM (
    'PENDING', 'APPLIED', 'FAILED', 'COMPENSATION_PENDING',
    'COMPENSATED', 'MANUAL_REVIEW'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "subscription_change" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "product" "ProductLine" NOT NULL,
  "subscription_id" TEXT,
  "change_type" TEXT NOT NULL,
  "target_plan_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "external_payment_id" TEXT,
  "requester_user_id" TEXT,
  "pay_provider" "SubscriptionPayProvider",
  "payment_method_ref" TEXT,
  "payment_confirmed_at" TIMESTAMP(3),
  "payment_status" "SubscriptionChangePaymentStatus" NOT NULL,
  "apply_status" "SubscriptionChangeApplyStatus" NOT NULL DEFAULT 'PENDING',
  "price_snapshot" JSONB NOT NULL,
  "last_error" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_change_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_change_idempotency_key_key"
  ON "subscription_change"("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_change_external_payment_id_key"
  ON "subscription_change"("external_payment_id");
CREATE INDEX IF NOT EXISTS "subscription_change_team_id_product_created_at_idx"
  ON "subscription_change"("team_id", "product", "created_at");
CREATE INDEX IF NOT EXISTS "subscription_change_payment_status_apply_status_next_retry__idx"
  ON "subscription_change"("payment_status", "apply_status", "next_retry_at");

DO $$
BEGIN
  ALTER TABLE "subscription_change"
    ADD CONSTRAINT "subscription_change_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
