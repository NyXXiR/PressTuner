import assert from "node:assert/strict";
import test from "node:test";

import { resolvePressKnowledgeRetrievalConfiguration } from "@/domain/knowledge/retrievalRuntime";
import { transformKnowledgeQuery } from "./knowledgeQueryTransformationService";

test("rewrite receives only the query and returns an auditable model plan", async () => {
  const inputs: string[] = [];
  const result = await transformKnowledgeQuery({
    query: "  올해   매출? ",
    configuration: resolvePressKnowledgeRetrievalConfiguration("rewrite-ablation-v1"),
    rewrite: async (query) => {
      inputs.push(query);
      return "PressTuner 올해 매출";
    },
  });
  assert.deepEqual(inputs, ["올해   매출?"]);
  assert.equal(result.mode, "MODEL_REWRITE");
  assert.equal(result.executedQuery, "PressTuner 올해 매출");
  assert.equal(result.model, "gpt-4.1-mini");
  assert.equal(result.usage, null);
  assert.equal(JSON.stringify(inputs).includes("team"), false);
});

test("baseline normalization never calls a model rewriter", async () => {
  let called = false;
  const result = await transformKnowledgeQuery({
    query: "A　 B",
    configuration: resolvePressKnowledgeRetrievalConfiguration("baseline-v1"),
    rewrite: async () => {
      called = true;
      return "bad";
    },
  });
  assert.equal(result.executedQuery, "A B");
  assert.equal(called, false);
});

test("identifier-aware normalization narrows explicit document identifiers without a model", async () => {
  let called = false;
  const result = await transformKnowledgeQuery({
    query: "PT-CAREER-001 문서와 CE-PDFKIT-002의 핵심 사실을 비교해줘",
    configuration: resolvePressKnowledgeRetrievalConfiguration("candidate-v3"),
    rewrite: async () => {
      called = true;
      return "bad";
    },
  });
  assert.equal(result.mode, "IDENTIFIER_AWARE_NORMALIZATION");
  assert.equal(result.executedQuery, "PT-CAREER-001 CE-PDFKIT-002");
  assert.equal(result.model, null);
  assert.equal(called, false);
});

test("identifier-aware normalization preserves ordinary natural-language queries", async () => {
  const result = await transformKnowledgeQuery({
    query: "  올해   매출을 알려줘  ",
    configuration: resolvePressKnowledgeRetrievalConfiguration("candidate-v3"),
  });
  assert.equal(result.mode, "IDENTIFIER_AWARE_NORMALIZATION");
  assert.equal(result.executedQuery, "올해 매출을 알려줘");
});
