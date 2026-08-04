import assert from "node:assert/strict";
import test from "node:test";

import { resolvePressKnowledgeRetrievalConfiguration } from "@/domain/knowledge/retrievalRuntime";
import { createKnowledgeReranker } from "./knowledgeRerankerService";

test("listwise reranker batches candidates once and exposes no authorization policy", async () => {
  let calls = 0;
  const reranker = createKnowledgeReranker({
    query: "매출",
    configuration: resolvePressKnowledgeRetrievalConfiguration("reranker-ablation-v1"),
    rank: async (query, candidates) => {
      calls += 1;
      assert.equal(query, "매출");
      assert.deepEqual(Object.keys(candidates[0] ?? {}).sort(), ["chunkId", "content"]);
      return { a: 0.2, b: 0.9 };
    },
  });
  assert.ok("scoreBatch" in reranker);
  if (!("scoreBatch" in reranker)) return;
  const scores = await reranker.scoreBatch([
    { chunkId: "a", content: "A" } as never,
    { chunkId: "b", content: "B" } as never,
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(scores, { a: 0.2, b: 0.9 });
});

test("baseline reranker performs no model work", () => {
  assert.deepEqual(
    createKnowledgeReranker({
      query: "q",
      configuration: resolvePressKnowledgeRetrievalConfiguration("baseline-v1"),
    }),
    { version: "NONE" },
  );
});

test("listwise reranker deterministically falls back to fused scores for omitted candidates", async () => {
  const reranker = createKnowledgeReranker({
    query: "매출",
    configuration: resolvePressKnowledgeRetrievalConfiguration("reranker-ablation-v1"),
    rank: async () => ({ a: 0.9, hallucinated: 1 }),
  });
  assert.ok("scoreBatch" in reranker);
  if (!("scoreBatch" in reranker)) return;
  const scores = await reranker.scoreBatch([
    { chunkId: "a", content: "A", fusedScore: 0.2 } as never,
    { chunkId: "b", content: "B", fusedScore: 0.4 } as never,
  ]);
  assert.deepEqual(scores, { a: 0.9, b: 0.4 });
});
