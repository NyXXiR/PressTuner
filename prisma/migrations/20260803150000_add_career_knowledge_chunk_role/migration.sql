-- Align the persisted chunk-role enum with the CAREER profile already used by
-- ingestion and retrieval. IF NOT EXISTS keeps repeated controlled deployments safe.
ALTER TYPE "KnowledgeChunkRole" ADD VALUE IF NOT EXISTS 'CAREER';
