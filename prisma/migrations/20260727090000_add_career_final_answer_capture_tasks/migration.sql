CREATE TYPE "CareerCaptureTaskStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'SUPERSEDED'
);

CREATE TABLE "career_final_answer_capture_task" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "answer_hash" TEXT NOT NULL,
  "answer_revision" INTEGER NOT NULL,
  "status" "CareerCaptureTaskStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "processing_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "capture_proposal_id" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "career_final_answer_capture_task_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "career_final_answer_capture_task_capture_proposal_id_key"
  ON "career_final_answer_capture_task"("capture_proposal_id");
CREATE UNIQUE INDEX "career_final_answer_capture_task_user_id_question_id_answer_hash_answer_revision_key"
  ON "career_final_answer_capture_task"("user_id", "question_id", "answer_hash", "answer_revision");
CREATE INDEX "career_final_answer_capture_task_status_next_attempt_at_created_at_idx"
  ON "career_final_answer_capture_task"("status", "next_attempt_at", "created_at");
CREATE INDEX "career_final_answer_capture_task_application_id_status_idx"
  ON "career_final_answer_capture_task"("application_id", "status");
CREATE INDEX "career_final_answer_capture_task_user_id_status_updated_at_idx"
  ON "career_final_answer_capture_task"("user_id", "status", "updated_at");

ALTER TABLE "career_final_answer_capture_task"
  ADD CONSTRAINT "career_final_answer_capture_task_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_final_answer_capture_task"
  ADD CONSTRAINT "career_final_answer_capture_task_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_final_answer_capture_task"
  ADD CONSTRAINT "career_final_answer_capture_task_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_final_answer_capture_task"
  ADD CONSTRAINT "career_final_answer_capture_task_capture_proposal_id_fkey"
  FOREIGN KEY ("capture_proposal_id") REFERENCES "career_capture_proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
