CREATE TYPE "PressTunerDebugSnapshotDeliveryState" AS ENUM ('PENDING', 'DELIVERED', 'CONFIGURATION_FAILURE', 'DELIVERY_CONFLICT', 'CONTRACT_FAILURE');
CREATE TABLE "press_tuner_debug_snapshot_outbox" (
  "id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "snapshot_revision" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "delivery_state" "PressTunerDebugSnapshotDeliveryState" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "safe_error_code" TEXT,
  "retry_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "press_tuner_debug_snapshot_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "press_tuner_debug_snapshot_outbox_attempt_id_snapshot_revision_key" ON "press_tuner_debug_snapshot_outbox"("attempt_id", "snapshot_revision");
CREATE UNIQUE INDEX "press_tuner_debug_snapshot_outbox_attempt_id_content_hash_key" ON "press_tuner_debug_snapshot_outbox"("attempt_id", "content_hash");
CREATE INDEX "press_tuner_debug_snapshot_outbox_delivery_state_retry_at_created_at_idx" ON "press_tuner_debug_snapshot_outbox"("delivery_state", "retry_at", "created_at");
ALTER TABLE "press_tuner_debug_snapshot_outbox" ADD CONSTRAINT "press_tuner_debug_snapshot_outbox_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
