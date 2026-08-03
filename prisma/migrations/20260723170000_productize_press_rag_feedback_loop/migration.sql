CREATE TYPE "KnowledgeUploadKind" AS ENUM ('UPLOAD', 'REPLACEMENT');
CREATE TYPE "AgentFeedbackRating" AS ENUM ('POSITIVE', 'NEGATIVE');

ALTER TABLE "knowledge_document"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "replaces_document_id" TEXT;

CREATE TABLE "knowledge_upload_event" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "user_id" TEXT,
  "document_id" TEXT,
  "kind" "KnowledgeUploadKind" NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_upload_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_run_feedback" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "usefulness" "AgentFeedbackRating",
  "citation_accuracy" "AgentFeedbackRating",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_run_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_run_feedback_at_least_one_rating"
    CHECK ("usefulness" IS NOT NULL OR "citation_accuracy" IS NOT NULL)
);

CREATE UNIQUE INDEX "knowledge_document_replaces_document_id_key" ON "knowledge_document"("replaces_document_id");
CREATE UNIQUE INDEX "knowledge_upload_event_document_id_key" ON "knowledge_upload_event"("document_id");
CREATE INDEX "knowledge_upload_event_team_id_created_at_idx" ON "knowledge_upload_event"("team_id", "created_at");
CREATE UNIQUE INDEX "agent_run_feedback_run_id_user_id_key" ON "agent_run_feedback"("run_id", "user_id");
CREATE INDEX "agent_run_feedback_team_id_created_at_idx" ON "agent_run_feedback"("team_id", "created_at");

ALTER TABLE "knowledge_document" ADD CONSTRAINT "knowledge_document_replaces_document_id_fkey" FOREIGN KEY ("replaces_document_id") REFERENCES "knowledge_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_upload_event" ADD CONSTRAINT "knowledge_upload_event_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_upload_event" ADD CONSTRAINT "knowledge_upload_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_upload_event" ADD CONSTRAINT "knowledge_upload_event_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_run_feedback" ADD CONSTRAINT "agent_run_feedback_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_feedback" ADD CONSTRAINT "agent_run_feedback_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_feedback" ADD CONSTRAINT "agent_run_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
