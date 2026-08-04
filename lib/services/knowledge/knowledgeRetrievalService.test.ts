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

test("hybrid retrieval exposes auditable stage scores and packs candidates before returning context", () => {
  assert.match(retrieval, /buildKnowledgeQueryPlan/);
  assert.match(retrieval, /buildKnowledgeRetrievalPolicy/);
  assert.match(retrieval, /finalizeKnowledgeRetrieval/);
  assert.match(retrieval, /AS "vectorRank"/);
  assert.match(retrieval, /AS "vectorScore"/);
  assert.match(retrieval, /AS "lexicalRank"/);
  assert.match(retrieval, /AS "lexicalScore"/);
  assert.match(retrieval, /AS "fusedRank"/);
  assert.match(retrieval, /AS "fusedScore"/);
  assert.match(retrieval, /kd\."source_version" AS "sourceVersion"/);
  assert.match(retrieval, /createKnowledgeReranker/);
  assert.match(retrieval, /combinedHybridSqlRetrievalMs/);
  assert.match(retrieval, /LIMIT \$\{candidateLimit\}/);
  assert.match(retrieval, /trace: finalized\.candidates/);
  assert.match(retrieval, /queryPlan/);
  assert.match(retrieval, /policy/);
});
