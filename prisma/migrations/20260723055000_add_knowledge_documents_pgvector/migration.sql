CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "KnowledgeDocumentStatus" AS ENUM (
  'UPLOADED',
  'QUEUED',
  'PARSING',
  'INDEXING',
  'READY',
  'FAILED'
);

CREATE TABLE "knowledge_document" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "uploaded_by_id" TEXT,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "source_version" INTEGER NOT NULL DEFAULT 1,
  "page_count" INTEGER,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "embedding_model" TEXT,
  "embedding_dimensions" INTEGER,
  "indexing_fingerprint" TEXT,
  "parser_version" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "source_data" BYTEA,
  "indexed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_chunk" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "token_count" INTEGER,
  "page_start" INTEGER NOT NULL,
  "page_end" INTEGER NOT NULL,
  "section_title" TEXT,
  "content_hash" TEXT NOT NULL,
  "parser_version" TEXT NOT NULL,
  "metadata" JSONB,
  "embedding" vector(1536),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_chunk_page_range_check"
    CHECK ("page_start" >= 1 AND "page_end" >= "page_start"),
  CONSTRAINT "knowledge_chunk_ordinal_check" CHECK ("ordinal" >= 0)
);

CREATE UNIQUE INDEX "knowledge_document_storage_key_key"
  ON "knowledge_document"("storage_key");
CREATE UNIQUE INDEX "knowledge_document_team_id_checksum_source_version_key"
  ON "knowledge_document"("team_id", "checksum", "source_version");
CREATE INDEX "knowledge_document_team_id_status_created_at_idx"
  ON "knowledge_document"("team_id", "status", "created_at");
CREATE UNIQUE INDEX "knowledge_chunk_document_id_ordinal_key"
  ON "knowledge_chunk"("document_id", "ordinal");
CREATE INDEX "knowledge_chunk_team_id_document_id_idx"
  ON "knowledge_chunk"("team_id", "document_id");
CREATE INDEX "knowledge_chunk_embedding_hnsw_idx"
  ON "knowledge_chunk"
  USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "knowledge_chunk_content_fts_idx"
  ON "knowledge_chunk"
  USING gin (to_tsvector('simple', "content"));

ALTER TABLE "knowledge_document"
  ADD CONSTRAINT "knowledge_document_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_document"
  ADD CONSTRAINT "knowledge_document_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunk"
  ADD CONSTRAINT "knowledge_chunk_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunk"
  ADD CONSTRAINT "knowledge_chunk_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
