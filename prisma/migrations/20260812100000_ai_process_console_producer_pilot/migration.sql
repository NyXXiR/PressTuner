CREATE TYPE "AiProcessTestRunStatus" AS ENUM ('RECEIVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED');
CREATE TYPE "AiProcessFactDeliveryState" AS ENUM ('PENDING', 'DELIVERED', 'DEAD_LETTER');

CREATE TABLE "ai_process_test_run" (
  "id" TEXT NOT NULL,
  "command_source" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "command_hash" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "test_run_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "process_id" TEXT,
  "process_version" TEXT,
  "process_definition_hash" TEXT,
  "fixture_artifact_id" TEXT NOT NULL,
  "fixture_sha256" TEXT NOT NULL,
  "fixture_locator" TEXT NOT NULL,
  "fact_attempt_id" TEXT NOT NULL,
  "status" "AiProcessTestRunStatus" NOT NULL DEFAULT 'RECEIVED',
  "rejection_code" TEXT,
  "failure_code" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_process_test_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_process_fact_outbox" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "event_type" TEXT NOT NULL,
  "canonical_hash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "delivery_state" "AiProcessFactDeliveryState" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "safe_error_code" TEXT,
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_process_fact_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_process_test_run_command_source_command_id_key" ON "ai_process_test_run"("command_source", "command_id");
CREATE UNIQUE INDEX "ai_process_test_run_project_id_test_run_id_key" ON "ai_process_test_run"("project_id", "test_run_id");
CREATE INDEX "ai_process_test_run_status_created_at_idx" ON "ai_process_test_run"("status", "created_at");
CREATE UNIQUE INDEX "ai_process_fact_outbox_source_event_id_key" ON "ai_process_fact_outbox"("source", "event_id");
CREATE UNIQUE INDEX "ai_process_fact_outbox_source_attempt_id_sequence_key" ON "ai_process_fact_outbox"("source", "attempt_id", "sequence");
CREATE INDEX "ai_process_fact_outbox_delivery_state_next_attempt_at_created_at_idx" ON "ai_process_fact_outbox"("delivery_state", "next_attempt_at", "created_at");
CREATE INDEX "ai_process_fact_outbox_source_attempt_id_sequence_idx" ON "ai_process_fact_outbox"("source", "attempt_id", "sequence");
