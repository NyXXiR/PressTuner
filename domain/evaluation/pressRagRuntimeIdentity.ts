import { createHash } from "node:crypto";

import {
  PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME,
  resolvePressKnowledgeRetrievalConfiguration,
  type PressKnowledgeRetrievalConfiguration,
} from "../knowledge/retrievalRuntime";
import { buildPressAgentInstructions } from "../press-agent/instructions";
import { PRESS_AGENT_TOOLS } from "../press-agent/runPolicy";
import { DEFAULT_PRESS_AGENT_RUNTIME_POLICY } from "../press-agent/runtimePolicy";
import { AI_MODELS } from "../../lib/constants/ai";
import {
  agentConfigurationIdentitySchema,
  identifyAgentConfiguration,
  sha256Canonical,
  type AgentConfigurationIdentity,
} from "./configurationIdentity";

const CURRENT_INDEXING_RUNTIME = Object.freeze({
  parser: "unpdf+parsed-block-ir-v1",
  chunker: "page-char-v1",
  targetChars: 1400,
  overlapChars: 200,
  embeddingDimensions: 1536,
});

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function currentChunkingVersion(chunkProfileMode?: string) {
  if (!chunkProfileMode || chunkProfileMode === "PAGE_CHAR_BASELINE") {
    return `${CURRENT_INDEXING_RUNTIME.chunker};targetChars=${CURRENT_INDEXING_RUNTIME.targetChars};overlapChars=${CURRENT_INDEXING_RUNTIME.overlapChars}`;
  }
  if (chunkProfileMode === "ROLE_AWARE_CANDIDATE") {
    return "role-aware-candidate-v1;FACT=press-fact-semantic-v1;CAREER=career-semantic-v1;STYLE_POLICY=style-policy-semantic-v1;STYLE_EXAMPLE=style-example-semantic-v1";
  }
  throw new Error(`UNSUPPORTED_KNOWLEDGE_CHUNK_PROFILE_MODE:${chunkProfileMode}`);
}

export function buildCurrentPressRagRuntimeIdentity(args?: {
  model?: string;
  embeddingModel?: string;
  chunkProfileMode?: string;
  queryTransformation?: PressKnowledgeRetrievalConfiguration["queryTransformation"];
  reranker?: PressKnowledgeRetrievalConfiguration["reranker"];
}): AgentConfigurationIdentity {
  const retrieval = PRESS_KNOWLEDGE_RETRIEVAL_RUNTIME;
  return {
    parser: { version: CURRENT_INDEXING_RUNTIME.parser },
    model: { version: args?.model ?? AI_MODELS.SMART_MINI },
    prompt: {
      version: `press-agent-prompt/sha256:${sha256Text(buildPressAgentInstructions())}`,
    },
    embedding: {
      version: `${args?.embeddingModel ?? AI_MODELS.EMBEDDING};dimensions=${CURRENT_INDEXING_RUNTIME.embeddingDimensions}`,
    },
    chunking: {
      version: currentChunkingVersion(args?.chunkProfileMode),
    },
    queryTransformation: {
      version:
        args?.queryTransformation === "MODEL_REWRITE"
          ? "gpt-4.1-mini-structured-rewrite-v1"
          : args?.queryTransformation === "IDENTIFIER_AWARE_NORMALIZATION"
            ? "identifier-aware-normalization-v1"
          : "deterministic-normalization-v1",
    },
    retrieval: {
      version: `${retrieval.version};vector=${retrieval.vectorMetric};lexical=${retrieval.lexicalAnalyzer};rrfK=${retrieval.rrfK};topK=${retrieval.defaultTopK}`,
    },
    reranking: {
      version:
        args?.reranker === "MODEL_LISTWISE"
          ? "gpt-4.1-mini-listwise-v1"
          : retrieval.reranker,
    },
    contextPacking: {
      version: `token-role-document-diversity-v1;tokenBudget=6000;maxPerDocument=2;topK=${retrieval.defaultTopK}`,
    },
    toolset: {
      version: `press-agent-tools/sha256:${sha256Canonical(PRESS_AGENT_TOOLS)}`,
    },
    runtimePolicy: {
      version:
        args?.queryTransformation === "IDENTIFIER_AWARE_NORMALIZATION"
          ? `${DEFAULT_PRESS_AGENT_RUNTIME_POLICY.version};agentDocumentFilter=opaque-id-v1;exactIdTopK=v1`
          : DEFAULT_PRESS_AGENT_RUNTIME_POLICY.version,
    },
    verifier: { version: "claim-span-verifier-v5-extractive-recovery" },
    evaluator: { version: "not-measured/current-product-runtime-v1" },
  };
}

export function identifyPressRagControlledLiveConfiguration(
  configuration: PressKnowledgeRetrievalConfiguration,
) {
  return identifyAgentConfiguration(
    buildCurrentPressRagRuntimeIdentity({
      chunkProfileMode: configuration.chunkProfileMode,
      queryTransformation: configuration.queryTransformation,
      reranker: configuration.reranker,
    }),
  );
}

export function resolvePressRagControlledLiveConfigurationIdentity(
  id: Parameters<typeof resolvePressKnowledgeRetrievalConfiguration>[0],
) {
  return identifyPressRagControlledLiveConfiguration(
    resolvePressKnowledgeRetrievalConfiguration(id),
  );
}

export const CURRENT_PRESS_RAG_RUNTIME_IDENTITY = identifyAgentConfiguration(
  buildCurrentPressRagRuntimeIdentity({
    chunkProfileMode: process.env.PT_KNOWLEDGE_CHUNK_PROFILE,
    queryTransformation: "DETERMINISTIC_NORMALIZATION",
    reranker: "NONE",
  }),
);

export function assertSupportedPressRagRuntimeIdentity(input: unknown) {
  const identity = agentConfigurationIdentitySchema.parse(input);
  const supported = [
    "baseline-v1",
    "rewrite-ablation-v1",
    "reranker-ablation-v1",
    "candidate-v1",
    "candidate-v2",
    "candidate-v3",
  ] as const;
  for (const configurationId of supported) {
    const candidate = resolvePressRagControlledLiveConfigurationIdentity(configurationId).identity;
    if (
      (Object.keys(candidate) as Array<keyof AgentConfigurationIdentity>).every(
        (dimension) => identity[dimension].version === candidate[dimension].version,
      )
    ) {
      return identity;
    }
  }
  const current = CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity;
  const mismatch = (Object.keys(current) as Array<keyof AgentConfigurationIdentity>).find(
    (dimension) => identity[dimension].version !== current[dimension].version,
  );
  throw new Error(`UNSUPPORTED_PRESS_RAG_RUNTIME_IDENTITY:${mismatch ?? "configuration"}`);
}

const DETERMINISTIC_REPLAY_VERSION = "not-executed/deterministic-replay-v1";
const PRODUCT_DIMENSIONS = [
  "parser",
  "model",
  "prompt",
  "embedding",
  "chunking",
  "queryTransformation",
  "retrieval",
  "reranking",
  "contextPacking",
  "toolset",
  "runtimePolicy",
  "verifier",
] as const;

export function assertDeterministicReplayConfiguration(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("INVALID_DETERMINISTIC_REPLAY_CONFIGURATION");
  }
  const raw = input as Record<string, unknown>;
  const identified = identifyAgentConfiguration(raw.identity);
  if (raw.id !== identified.id || raw.contentHash !== identified.contentHash) {
    throw new Error("DETERMINISTIC_REPLAY_CONFIGURATION_HASH_MISMATCH");
  }
  for (const dimension of PRODUCT_DIMENSIONS) {
    if (identified.identity[dimension].version !== DETERMINISTIC_REPLAY_VERSION) {
      throw new Error(
        `DETERMINISTIC_REPLAY_PRODUCT_STAGE_MUST_BE_NOT_EXECUTED:${dimension}`,
      );
    }
  }
  if (
    !/^press-rag-deterministic\/(baseline|candidate)-v1$/.test(
      identified.identity.evaluator.version,
    )
  ) {
    throw new Error("INVALID_DETERMINISTIC_REPLAY_EVALUATOR");
  }
  return identified;
}
