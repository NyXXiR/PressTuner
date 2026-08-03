CREATE TYPE "ResumeStrategyStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

ALTER TYPE "CareerCaptureTaskStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

ALTER TABLE "application"
  ADD COLUMN "client_request_id" TEXT,
  ADD COLUMN "brief" JSONB,
  ADD COLUMN "common_writing_guidance" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "strategy_status" "ResumeStrategyStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "strategy_error" JSONB,
  ADD COLUMN "strategy_updated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "application_user_id_client_request_id_key"
  ON "application"("user_id", "client_request_id");

UPDATE "application" AS application
SET "strategy_status" = 'READY'
WHERE EXISTS (
  SELECT 1
  FROM "question"
  WHERE "question"."application_id" = application."id"
    AND "question"."ai_advice" IS NOT NULL
);

ALTER TABLE "career_final_answer_capture_task"
  ADD COLUMN "skipped_at" TIMESTAMP(3),
  ADD COLUMN "skip_reason" TEXT;

ALTER TABLE "career_answer_grounding"
  ADD COLUMN "answer_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "memory_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "preferred_experience_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "retrieved_experience_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "retrieved_fact_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "fallback_used" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS "career_answer_grounding_question_id_answer_hash_created_at_idx";
CREATE INDEX "career_answer_grounding_question_id_answer_hash_answer_revision_created_at_idx"
  ON "career_answer_grounding"(
    "question_id",
    "answer_hash",
    "answer_revision",
    "created_at"
  );
