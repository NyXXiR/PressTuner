CREATE TYPE "ResumeDocumentImportStatus" AS ENUM ('WAITING_SOURCE', 'QUEUED', 'EXTRACTING', 'REVIEW_REQUIRED', 'COMPLETE', 'FAILED');
CREATE TYPE "ResumeDocumentCandidateKind" AS ENUM ('IDENTITY_FIELD', 'NARRATIVE', 'ITEM', 'TAGS', 'ELIGIBILITY_FIELD');
CREATE TYPE "ResumeDocumentApplyMode" AS ENUM ('FILL_EMPTY', 'APPEND', 'MERGE', 'REPLACE');

CREATE TABLE "resume_document_import" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "ResumeDocumentImportStatus" NOT NULL DEFAULT 'WAITING_SOURCE',
    "processing_version" INTEGER NOT NULL DEFAULT 0,
    "processing_attempt_token" TEXT,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "extractor_version" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "queued_at" TIMESTAMP(3),
    "processing_started_at" TIMESTAMP(3),
    "review_ready_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resume_document_import_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resume_document_candidate" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "ResumeDocumentCandidateKind" NOT NULL,
    "recommended_section_id" TEXT NOT NULL,
    "target_section_id" TEXT NOT NULL,
    "target_section_kind" TEXT NOT NULL,
    "apply_mode" "ResumeDocumentApplyMode" NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "CareerCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "applied_at" TIMESTAMP(3),
    "applied_payload_hash" TEXT,
    "applied_document_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resume_document_candidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resume_document_candidate_evidence" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "source_chunk_id" TEXT,
    "field_path" TEXT NOT NULL,
    "value_hash" TEXT,
    "excerpt" TEXT NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resume_document_candidate_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resume_document_import_user_id_status_created_at_idx" ON "resume_document_import"("user_id", "status", "created_at");
CREATE INDEX "resume_document_import_source_id_status_idx" ON "resume_document_import"("source_id", "status");
CREATE INDEX "resume_document_candidate_user_id_status_created_at_idx" ON "resume_document_candidate"("user_id", "status", "created_at");
CREATE INDEX "resume_document_candidate_import_id_status_idx" ON "resume_document_candidate"("import_id", "status");
CREATE INDEX "resume_document_candidate_user_id_applied_at_status_idx" ON "resume_document_candidate"("user_id", "applied_at", "status");
CREATE INDEX "resume_document_candidate_evidence_candidate_id_field_path_idx" ON "resume_document_candidate_evidence"("candidate_id", "field_path");
CREATE INDEX "resume_document_candidate_evidence_source_chunk_id_idx" ON "resume_document_candidate_evidence"("source_chunk_id");

ALTER TABLE "resume_document_import" ADD CONSTRAINT "resume_document_import_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_document_import" ADD CONSTRAINT "resume_document_import_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "career_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_document_candidate" ADD CONSTRAINT "resume_document_candidate_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "resume_document_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_document_candidate" ADD CONSTRAINT "resume_document_candidate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_document_candidate" ADD CONSTRAINT "resume_document_candidate_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resume_document_candidate_evidence" ADD CONSTRAINT "resume_document_candidate_evidence_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "resume_document_candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_document_candidate_evidence" ADD CONSTRAINT "resume_document_candidate_evidence_source_chunk_id_fkey" FOREIGN KEY ("source_chunk_id") REFERENCES "career_source_chunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
