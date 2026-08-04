export const PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME = Object.freeze({
  version: "hybrid-rrf-v1",
  vectorMetric: "cosine",
  lexicalAnalyzer: "simple",
  fusion: "rrf",
  rrfK: 60,
  defaultTopK: 8,
  maxTopK: 20,
  candidateMultiplier: 4,
  minimumCandidateCount: 20,
  reranker: "none/v1",
});

export type PressKnowledgeRetrievalConfiguration = Readonly<{
  id: "baseline-v1" | "rewrite-ablation-v1" | "reranker-ablation-v1" | "candidate-v1" | "candidate-v2" | "candidate-v3";
  chunkProfileMode: "PAGE_CHAR_BASELINE" | "ROLE_AWARE_CANDIDATE";
  queryTransformation: "DETERMINISTIC_NORMALIZATION" | "IDENTIFIER_AWARE_NORMALIZATION" | "MODEL_REWRITE";
  reranker: "NONE" | "MODEL_LISTWISE";
}>;

export const PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS = Object.freeze({
  "baseline-v1": Object.freeze({
    id: "baseline-v1",
    chunkProfileMode: "PAGE_CHAR_BASELINE",
    queryTransformation: "DETERMINISTIC_NORMALIZATION",
    reranker: "NONE",
  }),
  "rewrite-ablation-v1": Object.freeze({
    id: "rewrite-ablation-v1",
    chunkProfileMode: "PAGE_CHAR_BASELINE",
    queryTransformation: "MODEL_REWRITE",
    reranker: "NONE",
  }),
  "reranker-ablation-v1": Object.freeze({
    id: "reranker-ablation-v1",
    chunkProfileMode: "PAGE_CHAR_BASELINE",
    queryTransformation: "DETERMINISTIC_NORMALIZATION",
    reranker: "MODEL_LISTWISE",
  }),
  "candidate-v1": Object.freeze({
    id: "candidate-v1",
    chunkProfileMode: "ROLE_AWARE_CANDIDATE",
    queryTransformation: "MODEL_REWRITE",
    reranker: "MODEL_LISTWISE",
  }),
  "candidate-v2": Object.freeze({
    id: "candidate-v2",
    chunkProfileMode: "ROLE_AWARE_CANDIDATE",
    queryTransformation: "DETERMINISTIC_NORMALIZATION",
    reranker: "NONE",
  }),
  "candidate-v3": Object.freeze({
    id: "candidate-v3",
    chunkProfileMode: "ROLE_AWARE_CANDIDATE",
    queryTransformation: "IDENTIFIER_AWARE_NORMALIZATION",
    reranker: "NONE",
  }),
} satisfies Record<string, PressKnowledgeRetrievalConfiguration>);

export function resolvePressKnowledgeRetrievalConfiguration(
  id: keyof typeof PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS = "baseline-v1",
): PressKnowledgeRetrievalConfiguration {
  return PRESS_KNOWLEDGE_RETRIEVAL_CONFIGURATIONS[id];
}

export function resolvePressKnowledgeRetrievalLimits(topK?: number) {
  const limit = Math.min(
    PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME.maxTopK,
    Math.max(1, topK ?? PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME.defaultTopK),
  );
  return {
    limit,
    candidateLimit: Math.max(
      limit * PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME.candidateMultiplier,
      PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME.minimumCandidateCount,
    ),
  };
}
