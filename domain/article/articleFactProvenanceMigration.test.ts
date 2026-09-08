import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260812110000_allow_automatic_verification_rag_facts/migration.sql";

test("automatic verification RAG facts have a deployable provenance constraint", () => {
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /ADD COLUMN IF NOT EXISTS "source_key" TEXT/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "article_fact_article_id_source_key_key"/,
  );
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS "article_fact_rag_provenance_check"/,
  );
  assert.match(
    migration,
    /"candidate_id" IS NULL[\s\S]*"source_key" LIKE 'verification:evidence-fact-consistency:%'/,
  );
  assert.match(
    migration,
    /"origin" = 'USER'[\s\S]*"candidate_id" IS NULL[\s\S]*"document_id" IS NULL/,
  );
});
