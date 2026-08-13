CREATE TABLE "ai_process_producer_delivery_watermark" (
  "source" TEXT NOT NULL,
  "last_successful_delivery_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_process_producer_delivery_watermark_pkey" PRIMARY KEY ("source")
);

INSERT INTO "ai_process_producer_delivery_watermark" ("source", "last_successful_delivery_at")
SELECT "source", MAX("delivered_at")
FROM "ai_process_fact_outbox"
WHERE "delivery_state" = 'DELIVERED' AND "delivered_at" IS NOT NULL
GROUP BY "source"
ON CONFLICT ("source") DO UPDATE SET
  "last_successful_delivery_at" = GREATEST(
    "ai_process_producer_delivery_watermark"."last_successful_delivery_at",
    EXCLUDED."last_successful_delivery_at"
  );

CREATE INDEX "ai_process_fact_outbox_source_delivery_state_created_at_idx"
  ON "ai_process_fact_outbox"("source", "delivery_state", "created_at");

CREATE INDEX "ai_process_fact_outbox_source_delivery_state_delivered_at_idx"
  ON "ai_process_fact_outbox"("source", "delivery_state", "delivered_at");
