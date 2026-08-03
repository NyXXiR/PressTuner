ALTER TABLE "knowledge_document"
  ADD COLUMN "queued_at" TIMESTAMP(3),
  ADD COLUMN "processing_started_at" TIMESTAMP(3);
