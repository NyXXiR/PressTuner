-- Additive CAREER memory persistence. Existing resume and Press RAG tables are preserved.
CREATE TYPE "CareerExperienceType" AS ENUM ('WORK', 'PROJECT', 'EDUCATION', 'ACTIVITY', 'AWARD', 'OTHER');
CREATE TYPE "CareerExperienceStatus" AS ENUM ('CONFIRMED', 'NEEDS_REVIEW', 'ARCHIVED');
CREATE TYPE "CareerSourceStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PARSING', 'INDEXING', 'EXTRACTING', 'READY', 'FAILED');
CREATE TYPE "CareerCandidateOrigin" AS ENUM ('PDF', 'DIRECT_INPUT', 'FINAL_ANSWER');
CREATE TYPE "CareerCandidateMode" AS ENUM ('CREATE', 'LINK', 'AUGMENT');
CREATE TYPE "CareerCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CareerFactKind" AS ENUM ('ORGANIZATION', 'TITLE', 'TYPE', 'START_DATE', 'END_DATE', 'ACTION', 'OUTCOME', 'METRIC', 'TOOL', 'TAG', 'SUMMARY');
CREATE TYPE "CareerGroundingOperation" AS ENUM ('GENERATE', 'REVISE');
CREATE TYPE "CareerVerificationResult" AS ENUM ('PASS', 'WARN', 'BLOCK');
CREATE TYPE "CareerFindingType" AS ENUM ('SUPPORTED', 'CONTRADICTION', 'UNSUPPORTED');
CREATE TYPE "CareerRiskCategory" AS ENUM ('NUMBER', 'DATE', 'ORGANIZATION', 'TITLE', 'OTHER');

ALTER TABLE "user"
  ADD COLUMN "career_memory_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "experience_brick"
  ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_by_user_id" TEXT,
  ADD COLUMN "embedded_at" TIMESTAMP(3),
  ADD COLUMN "embedding" vector(1536),
  ADD COLUMN "embedding_content_hash" TEXT,
  ADD COLUMN "embedding_model" TEXT,
  ADD COLUMN "end_date" TIMESTAMP(3),
  ADD COLUMN "experience_type" "CareerExperienceType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "memory_status" "CareerExperienceStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "metrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "organization" TEXT,
  ADD COLUMN "outcomes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "role_title" TEXT,
  ADD COLUMN "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "question"
  ADD COLUMN "answer_revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "career_source" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "team_id" TEXT,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "source_data" BYTEA,
  "status" "CareerSourceStatus" NOT NULL DEFAULT 'UPLOADED',
  "processing_version" INTEGER NOT NULL DEFAULT 0,
  "page_count" INTEGER,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "parser_version" TEXT,
  "embedding_model" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "queued_at" TIMESTAMP(3),
  "processing_started_at" TIMESTAMP(3),
  "ready_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "career_source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_source_chunk" (
  "id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "page_start" INTEGER NOT NULL,
  "page_end" INTEGER NOT NULL,
  "token_count" INTEGER,
  "parser_version" TEXT,
  "parser_metadata" JSONB,
  "embedding" vector(1536),
  "embedding_model" TEXT,
  "embedded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "career_source_chunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "career_source_chunk_page_range_check" CHECK ("page_start" >= 1 AND "page_end" >= "page_start")
);

CREATE TABLE "career_experience_candidate" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_id" TEXT,
  "question_id" TEXT,
  "target_experience_id" TEXT,
  "origin" "CareerCandidateOrigin" NOT NULL,
  "mode" "CareerCandidateMode" NOT NULL DEFAULT 'CREATE',
  "status" "CareerCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "original_text" TEXT,
  "organization" TEXT,
  "role_title" TEXT,
  "experience_type" "CareerExperienceType" NOT NULL DEFAULT 'OTHER',
  "period" TEXT,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "outcomes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reviewed_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "career_experience_candidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "career_candidate_mode_target_check" CHECK (
    ("mode" = 'CREATE' AND "target_experience_id" IS NULL)
    OR ("mode" IN ('LINK', 'AUGMENT') AND "target_experience_id" IS NOT NULL)
  ),
  CONSTRAINT "career_candidate_dates_check" CHECK (
    "end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"
  )
);

CREATE TABLE "career_candidate_evidence" (
  "id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "source_chunk_id" TEXT,
  "field_path" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "page_start" INTEGER,
  "page_end" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_candidate_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "career_candidate_evidence_page_range_check" CHECK (
    ("page_start" IS NULL AND "page_end" IS NULL)
    OR ("page_start" >= 1 AND "page_end" >= "page_start")
  )
);

CREATE TABLE "career_fact" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "experience_id" TEXT NOT NULL,
  "kind" "CareerFactKind" NOT NULL,
  "field_path" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "embedding" vector(1536),
  "embedding_content_hash" TEXT,
  "embedding_model" TEXT,
  "embedded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "career_fact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_fact_evidence" (
  "id" TEXT NOT NULL,
  "fact_id" TEXT NOT NULL,
  "candidate_id" TEXT,
  "source_chunk_id" TEXT,
  "field_path" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "page_start" INTEGER,
  "page_end" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_fact_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "career_fact_evidence_page_range_check" CHECK (
    ("page_start" IS NULL AND "page_end" IS NULL)
    OR ("page_start" >= 1 AND "page_end" >= "page_start")
  )
);

CREATE TABLE "career_answer_grounding" (
  "id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "operation" "CareerGroundingOperation" NOT NULL,
  "answer_hash" TEXT NOT NULL,
  "query_hash" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "retrieval_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_answer_grounding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_answer_grounding_experience" (
  "grounding_id" TEXT NOT NULL,
  "experience_id" TEXT NOT NULL,
  CONSTRAINT "career_answer_grounding_experience_pkey" PRIMARY KEY ("grounding_id", "experience_id")
);

CREATE TABLE "career_answer_grounding_fact" (
  "grounding_id" TEXT NOT NULL,
  "fact_id" TEXT NOT NULL,
  CONSTRAINT "career_answer_grounding_fact_pkey" PRIMARY KEY ("grounding_id", "fact_id")
);

CREATE TABLE "career_answer_verification" (
  "id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "answer_hash" TEXT NOT NULL,
  "answer_revision" INTEGER NOT NULL,
  "career_memory_version" INTEGER NOT NULL,
  "verifier_version" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "result" "CareerVerificationResult" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_answer_verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_answer_verification_finding" (
  "id" TEXT NOT NULL,
  "verification_id" TEXT NOT NULL,
  "type" "CareerFindingType" NOT NULL,
  "risk_category" "CareerRiskCategory" NOT NULL,
  "claim" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "supporting_fact_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_answer_verification_finding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_verification_override" (
  "id" TEXT NOT NULL,
  "verification_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "answer_hash" TEXT NOT NULL,
  "answer_revision" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "career_verification_override_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "career_source_user_id_deleted_at_created_at_idx" ON "career_source"("user_id", "deleted_at", "created_at");
CREATE INDEX "career_source_user_id_status_updated_at_idx" ON "career_source"("user_id", "status", "updated_at");
CREATE INDEX "career_source_user_id_checksum_deleted_at_idx" ON "career_source"("user_id", "checksum", "deleted_at");
CREATE UNIQUE INDEX "career_source_chunk_source_id_ordinal_key" ON "career_source_chunk"("source_id", "ordinal");
CREATE INDEX "career_source_chunk_user_id_source_id_page_start_idx" ON "career_source_chunk"("user_id", "source_id", "page_start");
CREATE INDEX "career_experience_candidate_user_id_status_created_at_idx" ON "career_experience_candidate"("user_id", "status", "created_at");
CREATE INDEX "career_experience_candidate_source_id_status_idx" ON "career_experience_candidate"("source_id", "status");
CREATE INDEX "career_experience_candidate_question_id_status_idx" ON "career_experience_candidate"("question_id", "status");
CREATE INDEX "career_candidate_evidence_candidate_id_field_path_idx" ON "career_candidate_evidence"("candidate_id", "field_path");
CREATE INDEX "career_candidate_evidence_source_chunk_id_idx" ON "career_candidate_evidence"("source_chunk_id");
CREATE INDEX "career_fact_user_id_active_kind_idx" ON "career_fact"("user_id", "active", "kind");
CREATE INDEX "career_fact_experience_id_active_idx" ON "career_fact"("experience_id", "active");
CREATE INDEX "career_fact_evidence_fact_id_idx" ON "career_fact_evidence"("fact_id");
CREATE INDEX "career_fact_evidence_candidate_id_idx" ON "career_fact_evidence"("candidate_id");
CREATE INDEX "career_fact_evidence_source_chunk_id_idx" ON "career_fact_evidence"("source_chunk_id");
CREATE INDEX "career_answer_grounding_question_id_answer_hash_created_at_idx" ON "career_answer_grounding"("question_id", "answer_hash", "created_at");
CREATE INDEX "career_answer_grounding_user_id_created_at_idx" ON "career_answer_grounding"("user_id", "created_at");
CREATE INDEX "career_answer_grounding_experience_experience_id_idx" ON "career_answer_grounding_experience"("experience_id");
CREATE INDEX "career_answer_grounding_fact_fact_id_idx" ON "career_answer_grounding_fact"("fact_id");
CREATE INDEX "career_answer_verification_question_id_answer_hash_answer_r_idx" ON "career_answer_verification"("question_id", "answer_hash", "answer_revision", "created_at");
CREATE INDEX "career_answer_verification_user_id_created_at_idx" ON "career_answer_verification"("user_id", "created_at");
CREATE INDEX "career_answer_verification_finding_verification_id_type_idx" ON "career_answer_verification_finding"("verification_id", "type");
CREATE UNIQUE INDEX "career_verification_override_verification_id_key" ON "career_verification_override"("verification_id");
CREATE INDEX "career_verification_override_user_id_created_at_idx" ON "career_verification_override"("user_id", "created_at");

ALTER TABLE "career_source" ADD CONSTRAINT "career_source_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_source_chunk" ADD CONSTRAINT "career_source_chunk_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "career_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_experience_candidate" ADD CONSTRAINT "career_experience_candidate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_experience_candidate" ADD CONSTRAINT "career_experience_candidate_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_experience_candidate" ADD CONSTRAINT "career_experience_candidate_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "career_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_experience_candidate" ADD CONSTRAINT "career_experience_candidate_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_experience_candidate" ADD CONSTRAINT "career_experience_candidate_target_experience_id_fkey" FOREIGN KEY ("target_experience_id") REFERENCES "experience_brick"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_candidate_evidence" ADD CONSTRAINT "career_candidate_evidence_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "career_experience_candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_candidate_evidence" ADD CONSTRAINT "career_candidate_evidence_source_chunk_id_fkey" FOREIGN KEY ("source_chunk_id") REFERENCES "career_source_chunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experience_brick"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_fact_evidence" ADD CONSTRAINT "career_fact_evidence_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "career_fact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_fact_evidence" ADD CONSTRAINT "career_fact_evidence_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "career_experience_candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_fact_evidence" ADD CONSTRAINT "career_fact_evidence_source_chunk_id_fkey" FOREIGN KEY ("source_chunk_id") REFERENCES "career_source_chunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_answer_grounding" ADD CONSTRAINT "career_answer_grounding_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_answer_grounding" ADD CONSTRAINT "career_answer_grounding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_answer_grounding_experience" ADD CONSTRAINT "career_answer_grounding_experience_grounding_id_fkey" FOREIGN KEY ("grounding_id") REFERENCES "career_answer_grounding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_answer_grounding_experience" ADD CONSTRAINT "career_answer_grounding_experience_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "experience_brick"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "career_answer_grounding_fact" ADD CONSTRAINT "career_answer_grounding_fact_grounding_id_fkey" FOREIGN KEY ("grounding_id") REFERENCES "career_answer_grounding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_answer_grounding_fact" ADD CONSTRAINT "career_answer_grounding_fact_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "career_fact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "career_answer_verification" ADD CONSTRAINT "career_answer_verification_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_answer_verification" ADD CONSTRAINT "career_answer_verification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_answer_verification_finding" ADD CONSTRAINT "career_answer_verification_finding_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "career_answer_verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_verification_override" ADD CONSTRAINT "career_verification_override_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "career_answer_verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_verification_override" ADD CONSTRAINT "career_verification_override_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deterministic legacy backfill: no inferred organization, title, or metrics.
UPDATE "experience_brick"
SET
  "memory_status" = 'CONFIRMED',
  "confirmed_at" = COALESCE("updated_at", "created_at"),
  "confirmed_by_user_id" = "user_id";

INSERT INTO "career_fact" (
  "id", "user_id", "experience_id", "kind", "field_path", "value",
  "normalized_value", "active", "created_at", "updated_at"
)
SELECT
  'legacy-summary-' || "id",
  "user_id",
  "id",
  'SUMMARY',
  'summary',
  CONCAT_WS(E'\n', NULLIF(BTRIM("title"), ''), NULLIF(BTRIM("content"), ''), NULLIF(BTRIM("original_text"), '')),
  LOWER(REGEXP_REPLACE(CONCAT_WS(' ', NULLIF(BTRIM("title"), ''), NULLIF(BTRIM("content"), ''), NULLIF(BTRIM("original_text"), '')), '\s+', ' ', 'g')),
  true,
  "created_at",
  "updated_at"
FROM "experience_brick";

INSERT INTO "career_fact" (
  "id", "user_id", "experience_id", "kind", "field_path", "value",
  "normalized_value", "active", "created_at", "updated_at"
)
SELECT
  'legacy-period-' || "id",
  "user_id",
  "id",
  'START_DATE',
  'period',
  BTRIM("period"),
  LOWER(REGEXP_REPLACE(BTRIM("period"), '\s+', ' ', 'g')),
  true,
  "created_at",
  "updated_at"
FROM "experience_brick"
WHERE NULLIF(BTRIM("period"), '') IS NOT NULL;

-- Correctness-first text indexes. HNSW tuning is intentionally deferred until
-- the deployment environment's pgvector operator classes are verified.
CREATE INDEX "career_source_chunk_content_fts_idx"
  ON "career_source_chunk" USING GIN (to_tsvector('simple', "content"));
CREATE INDEX "experience_brick_career_fts_idx"
  ON "experience_brick" USING GIN (
    to_tsvector(
      'simple',
      COALESCE("title", '') || ' ' || COALESCE("content", '') || ' ' ||
      COALESCE("organization", '') || ' ' || COALESCE("role_title", '')
    )
  );
CREATE INDEX "career_fact_value_fts_idx"
  ON "career_fact" USING GIN (to_tsvector('simple', "value"));
