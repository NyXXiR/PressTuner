import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function roleBlock(schema: string) {
  return schema.match(/enum KnowledgeChunkRole \{[\s\S]*?\}/)?.[0] ?? "";
}

test("CAREER knowledge role is represented in Prisma and an idempotent migration", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260803150000_add_career_knowledge_chunk_role/migration.sql",
    "utf8",
  );
  assert.match(roleBlock(schema), /\bCAREER\b/);
  assert.match(
    migration,
    /ALTER TYPE "KnowledgeChunkRole" ADD VALUE IF NOT EXISTS 'CAREER'/,
  );
});
