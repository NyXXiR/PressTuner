CREATE TYPE "KnowledgeChunkRole" AS ENUM ('FACT', 'STYLE_POLICY', 'STYLE_EXAMPLE', 'IGNORE');
CREATE TYPE "KnowledgeGenerationStatus" AS ENUM ('QUEUED', 'PARSING', 'INDEXING', 'READY', 'FAILED');
CREATE TYPE "KnowledgeClassificationStatus" AS ENUM ('PENDING', 'CLASSIFYING', 'READY', 'FAILED');
CREATE TYPE "ArticleEvidenceDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "ArticleFactOrigin" AS ENUM ('RAG', 'USER');
CREATE TYPE "ArticleVerificationResult" AS ENUM ('PASS', 'WARN', 'BLOCK');
CREATE TYPE "ArticleVerificationFindingType" AS ENUM ('CONTRADICTION', 'UNSUPPORTED', 'STYLE_POLICY');
CREATE TYPE "ArticleVerificationRiskCategory" AS ENUM ('NUMBER', 'PERIOD', 'DATE', 'PERSON', 'TITLE', 'DIRECT_QUOTE', 'OTHER');

ALTER TABLE "team" ADD COLUMN "knowledge_corpus_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "knowledge_document"
  ADD COLUMN "active_generation_id" TEXT,
  ADD COLUMN "classification_override" "KnowledgeChunkRole";

CREATE TABLE "knowledge_index_generation" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "parser_version" TEXT NOT NULL,
  "chunker_version" TEXT NOT NULL,
  "embedding_model" TEXT NOT NULL,
  "embedding_dimensions" INTEGER NOT NULL,
  "classifier_version" TEXT,
  "index_status" "KnowledgeGenerationStatus" NOT NULL DEFAULT 'QUEUED',
  "classification_status" "KnowledgeClassificationStatus" NOT NULL DEFAULT 'PENDING',
  "error_code" TEXT,
  "error_message" TEXT,
  "indexing_started_at" TIMESTAMP(3),
  "indexed_at" TIMESTAMP(3),
  "classification_started_at" TIMESTAMP(3),
  "classified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_index_generation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_index_generation_document_id_generation_key" ON "knowledge_index_generation"("document_id", "generation");
CREATE UNIQUE INDEX "knowledge_index_generation_document_id_fingerprint_key" ON "knowledge_index_generation"("document_id", "fingerprint");
CREATE INDEX "knowledge_index_generation_document_id_index_status_classification_status_idx" ON "knowledge_index_generation"("document_id", "index_status", "classification_status");

INSERT INTO "knowledge_index_generation" (
  "id", "document_id", "generation", "fingerprint", "parser_version",
  "chunker_version", "embedding_model", "embedding_dimensions", "index_status",
  "classification_status", "indexing_started_at", "indexed_at", "created_at", "updated_at"
)
SELECT
  'legacy_' || md5(d."id"), d."id", 1,
  COALESCE(d."indexing_fingerprint", 'legacy:' || d."checksum"),
  COALESCE(d."parser_version", 'legacy'), 'legacy',
  COALESCE(d."embedding_model", 'legacy'), COALESCE(d."embedding_dimensions", 1536),
  CASE
    WHEN d."status" = 'READY' THEN 'READY'::"KnowledgeGenerationStatus"
    WHEN d."status" = 'FAILED' THEN 'FAILED'::"KnowledgeGenerationStatus"
    WHEN d."status" = 'PARSING' THEN 'PARSING'::"KnowledgeGenerationStatus"
    WHEN d."status" = 'INDEXING' THEN 'INDEXING'::"KnowledgeGenerationStatus"
    ELSE 'QUEUED'::"KnowledgeGenerationStatus"
  END,
  'PENDING'::"KnowledgeClassificationStatus", d."processing_started_at",
  d."indexed_at", d."created_at", d."updated_at"
FROM "knowledge_document" d
WHERE EXISTS (SELECT 1 FROM "knowledge_chunk" c WHERE c."document_id" = d."id");

ALTER TABLE "knowledge_chunk"
  ADD COLUMN "generation_id" TEXT,
  ADD COLUMN "auto_role" "KnowledgeChunkRole",
  ADD COLUMN "role_confidence" DOUBLE PRECISION,
  ADD COLUMN "role_rationale" TEXT,
  ADD COLUMN "classifier_version" TEXT,
  ADD COLUMN "classified_at" TIMESTAMP(3);
UPDATE "knowledge_chunk" SET "generation_id" = 'legacy_' || md5("document_id");
UPDATE "knowledge_document" d
SET "active_generation_id" = 'legacy_' || md5(d."id")
WHERE d."status" = 'READY'
  AND EXISTS (SELECT 1 FROM "knowledge_index_generation" g WHERE g."document_id" = d."id");
ALTER TABLE "knowledge_chunk" ALTER COLUMN "generation_id" SET NOT NULL;

DROP INDEX "knowledge_chunk_document_id_ordinal_key";
CREATE UNIQUE INDEX "knowledge_chunk_generation_id_ordinal_key" ON "knowledge_chunk"("generation_id", "ordinal");
DROP INDEX IF EXISTS "knowledge_chunk_team_id_document_id_idx";
CREATE INDEX "knowledge_chunk_team_id_document_id_generation_id_idx" ON "knowledge_chunk"("team_id", "document_id", "generation_id");
CREATE INDEX "knowledge_chunk_team_id_auto_role_idx" ON "knowledge_chunk"("team_id", "auto_role");
CREATE UNIQUE INDEX "knowledge_document_active_generation_id_key" ON "knowledge_document"("active_generation_id");

ALTER TABLE "knowledge_index_generation"
  ADD CONSTRAINT "knowledge_index_generation_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_document"
  ADD CONSTRAINT "knowledge_document_active_generation_id_fkey" FOREIGN KEY ("active_generation_id") REFERENCES "knowledge_index_generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunk"
  ADD CONSTRAINT "knowledge_chunk_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "knowledge_index_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_chunk_role_confidence_check" CHECK ("role_confidence" IS NULL OR ("role_confidence" >= 0 AND "role_confidence" <= 1));

ALTER TABLE "agent_citation" RENAME TO "agent_retrieved_source";
ALTER TABLE "agent_retrieved_source" RENAME CONSTRAINT "agent_citation_pkey" TO "agent_retrieved_source_pkey";
ALTER TABLE "agent_retrieved_source" RENAME CONSTRAINT "agent_citation_run_id_fkey" TO "agent_retrieved_source_run_id_fkey";
ALTER TABLE "agent_retrieved_source" RENAME CONSTRAINT "agent_citation_step_id_fkey" TO "agent_retrieved_source_step_id_fkey";
ALTER TABLE "agent_retrieved_source" RENAME CONSTRAINT "agent_citation_document_id_fkey" TO "agent_retrieved_source_document_id_fkey";
ALTER TABLE "agent_retrieved_source" RENAME CONSTRAINT "agent_citation_chunk_id_fkey" TO "agent_retrieved_source_chunk_id_fkey";
ALTER INDEX "agent_citation_run_id_source_id_key" RENAME TO "agent_retrieved_source_run_id_source_id_key";
ALTER INDEX "agent_citation_document_id_page_start_idx" RENAME TO "agent_retrieved_source_document_id_page_start_idx";

CREATE TABLE "agent_citation" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "step_id" TEXT,
  "document_id" TEXT NOT NULL,
  "chunk_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "document_name" TEXT NOT NULL,
  "page_start" INTEGER NOT NULL,
  "page_end" INTEGER NOT NULL,
  "excerpt" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_citation_pkey" PRIMARY KEY ("id")
);
INSERT INTO "agent_citation" (
  "id", "run_id", "step_id", "document_id", "chunk_id", "source_id",
  "document_name", "page_start", "page_end", "excerpt", "created_at"
)
SELECT
  'final_' || md5(rs."id"), rs."run_id", rs."step_id", rs."document_id",
  rs."chunk_id", rs."source_id", rs."document_name", rs."page_start",
  rs."page_end", rs."excerpt", rs."created_at"
FROM "agent_retrieved_source" rs
JOIN "agent_run" r ON r."id" = rs."run_id"
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(r."output"->'sourceIds') = 'array'
    THEN r."output"->'sourceIds' ELSE '[]'::jsonb END
) selected("source_id")
WHERE r."status" = 'COMPLETED' AND selected."source_id" = rs."source_id"
ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX "agent_citation_run_id_source_id_key" ON "agent_citation"("run_id", "source_id");
CREATE INDEX "agent_citation_document_id_page_start_idx" ON "agent_citation"("document_id", "page_start");

CREATE TABLE "article_grounding_state" (
  "id" TEXT NOT NULL, "article_id" TEXT NOT NULL,
  "grounding_revision" INTEGER NOT NULL DEFAULT 0,
  "latest_discovery_content_hash" TEXT,
  "latest_discovery_corpus_version" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_grounding_state_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "article_grounding_state_article_id_key" ON "article_grounding_state"("article_id");

CREATE TABLE "article_evidence_candidate" (
  "id" TEXT NOT NULL, "article_id" TEXT NOT NULL, "team_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL, "chunk_id" TEXT NOT NULL,
  "content" TEXT NOT NULL, "page_start" INTEGER NOT NULL, "page_end" INTEGER NOT NULL,
  "excerpt" TEXT NOT NULL, "score" DOUBLE PRECISION NOT NULL,
  "decision" "ArticleEvidenceDecision" NOT NULL DEFAULT 'PENDING',
  "discovered_corpus_version" INTEGER NOT NULL, "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_evidence_candidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "article_evidence_candidate_article_id_chunk_id_key" ON "article_evidence_candidate"("article_id", "chunk_id");
CREATE INDEX "article_evidence_candidate_team_id_article_id_decision_idx" ON "article_evidence_candidate"("team_id", "article_id", "decision");

CREATE TABLE "article_fact" (
  "id" TEXT NOT NULL, "article_id" TEXT NOT NULL, "team_id" TEXT NOT NULL,
  "candidate_id" TEXT, "origin" "ArticleFactOrigin" NOT NULL,
  "content" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "document_id" TEXT, "chunk_id" TEXT, "page_start" INTEGER, "page_end" INTEGER,
  "excerpt" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_fact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "article_fact_rag_provenance_check" CHECK (
    ("origin" = 'RAG' AND "candidate_id" IS NOT NULL AND "document_id" IS NOT NULL
      AND "chunk_id" IS NOT NULL AND "page_start" IS NOT NULL
      AND "page_end" IS NOT NULL AND "excerpt" IS NOT NULL)
    OR
    ("origin" = 'USER' AND "candidate_id" IS NULL AND "document_id" IS NULL
      AND "chunk_id" IS NULL AND "page_start" IS NULL
      AND "page_end" IS NULL AND "excerpt" IS NULL)
  )
);
CREATE UNIQUE INDEX "article_fact_candidate_id_key" ON "article_fact"("candidate_id");
CREATE INDEX "article_fact_team_id_article_id_active_idx" ON "article_fact"("team_id", "article_id", "active");

CREATE TABLE "article_draft_evidence" (
  "id" TEXT NOT NULL, "article_id" TEXT NOT NULL, "fact_id" TEXT NOT NULL,
  "draft_hash" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_draft_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "article_draft_evidence_article_id_draft_hash_fact_id_key" ON "article_draft_evidence"("article_id", "draft_hash", "fact_id");
CREATE INDEX "article_draft_evidence_article_id_draft_hash_idx" ON "article_draft_evidence"("article_id", "draft_hash");

CREATE TABLE "article_verification" (
  "id" TEXT NOT NULL, "article_id" TEXT NOT NULL, "team_id" TEXT,
  "draft_hash" TEXT NOT NULL, "grounding_revision" INTEGER NOT NULL,
  "corpus_version" INTEGER NOT NULL, "verifier_version" TEXT NOT NULL,
  "model_version" TEXT NOT NULL, "result" "ArticleVerificationResult" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "article_verification_article_id_created_at_idx" ON "article_verification"("article_id", "created_at");
CREATE INDEX "article_verification_team_id_created_at_idx" ON "article_verification"("team_id", "created_at");

CREATE TABLE "article_verification_finding" (
  "id" TEXT NOT NULL, "verification_id" TEXT NOT NULL,
  "type" "ArticleVerificationFindingType" NOT NULL,
  "risk_category" "ArticleVerificationRiskCategory" NOT NULL,
  "result" "ArticleVerificationResult" NOT NULL,
  "claim" TEXT NOT NULL, "explanation" TEXT NOT NULL,
  "evidence_fact_ids" TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_verification_finding_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "article_verification_finding_verification_id_result_idx" ON "article_verification_finding"("verification_id", "result");

CREATE TABLE "article_final_citation" (
  "id" TEXT NOT NULL, "article_id" TEXT NOT NULL, "team_id" TEXT,
  "verification_id" TEXT NOT NULL, "fact_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL, "chunk_id" TEXT NOT NULL,
  "page_start" INTEGER NOT NULL, "page_end" INTEGER NOT NULL,
  "excerpt" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_final_citation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "article_final_citation_verification_id_fact_id_key" ON "article_final_citation"("verification_id", "fact_id");
CREATE INDEX "article_final_citation_article_id_created_at_idx" ON "article_final_citation"("article_id", "created_at");
CREATE INDEX "article_final_citation_document_id_page_start_idx" ON "article_final_citation"("document_id", "page_start");

ALTER TABLE "agent_citation"
  ADD CONSTRAINT "agent_citation_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "agent_citation_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "agent_step"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "agent_citation_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "agent_citation_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_grounding_state"
  ADD CONSTRAINT "article_grounding_state_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_evidence_candidate"
  ADD CONSTRAINT "article_evidence_candidate_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_evidence_candidate_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_evidence_candidate_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "article_evidence_candidate_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_fact"
  ADD CONSTRAINT "article_fact_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_fact_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_fact_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "article_evidence_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "article_fact_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "article_fact_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_draft_evidence"
  ADD CONSTRAINT "article_draft_evidence_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_draft_evidence_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "article_fact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_verification"
  ADD CONSTRAINT "article_verification_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_verification_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_verification_finding"
  ADD CONSTRAINT "article_verification_finding_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "article_verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_final_citation"
  ADD CONSTRAINT "article_final_citation_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_final_citation_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_final_citation_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "article_verification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "article_final_citation_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "article_fact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "article_final_citation_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "article_final_citation_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
