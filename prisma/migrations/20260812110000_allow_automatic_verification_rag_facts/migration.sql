-- `source_key` is the stable identity for managed USER facts and for
-- verifier-created RAG facts that come directly from exact document lineage.
ALTER TABLE "article_fact"
  ADD COLUMN IF NOT EXISTS "source_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "article_fact_article_id_source_key_key"
  ON "article_fact"("article_id", "source_key");

-- Candidate-accepted RAG facts retain their candidate identity. Automatic
-- verifier facts have no candidate and are admitted only under the reserved
-- source namespace, while still requiring complete document provenance.
ALTER TABLE "article_fact"
  DROP CONSTRAINT IF EXISTS "article_fact_rag_provenance_check";

ALTER TABLE "article_fact"
  ADD CONSTRAINT "article_fact_rag_provenance_check" CHECK (
    (
      "origin" = 'RAG'
      AND "document_id" IS NOT NULL
      AND "chunk_id" IS NOT NULL
      AND "page_start" IS NOT NULL
      AND "page_end" IS NOT NULL
      AND "excerpt" IS NOT NULL
      AND (
        "candidate_id" IS NOT NULL
        OR (
          "candidate_id" IS NULL
          AND "source_key" LIKE 'verification:evidence-fact-consistency:%'
        )
      )
    )
    OR
    (
      "origin" = 'USER'
      AND "candidate_id" IS NULL
      AND "document_id" IS NULL
      AND "chunk_id" IS NULL
      AND "page_start" IS NULL
      AND "page_end" IS NULL
      AND "excerpt" IS NULL
    )
  );
