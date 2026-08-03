import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const retrieval = readFileSync(
  "lib/services/knowledge/knowledgeRetrievalService.ts",
  "utf8",
);

test("all hybrid retrieval branches share the deletion and READY-successor predicate", () => {
  assert.equal((retrieval.match(/\$\{lifecyclePredicate\}/g) ?? []).length, 3);
  assert.match(retrieval, /kd\."deleted_at" IS NULL/);
  assert.match(retrieval, /successor\."replaces_document_id" = kd\."id"/);
  assert.match(retrieval, /successor\."team_id" = \$\{args\.teamId\}/);
  assert.match(retrieval, /successor\."status" = 'READY'/);
});
