import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT_PRESS_RAG_RUNTIME_IDENTITY,
  assertDeterministicReplayConfiguration,
  assertSupportedPressRagRuntimeIdentity,
  buildCurrentPressRagRuntimeIdentity,
  resolvePressRagControlledLiveConfigurationIdentity,
} from "./pressRagRuntimeIdentity";
import { resolvePressKnowledgeRetrievalConfiguration } from "../knowledge/retrievalRuntime";

const readJson = async (relativePath: string) =>
  JSON.parse(await readFile(relativePath, "utf8"));

test("current Press RAG identity reports only the runtime that is actually implemented", () => {
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.parser.version,
    "unpdf+parsed-block-ir-v1",
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.chunking.version,
    "page-char-v1;targetChars=1400;overlapChars=200",
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.queryTransformation.version,
    "deterministic-normalization-v1",
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.retrieval.version,
    "hybrid-rrf-v1;vector=cosine;lexical=simple;rrfK=60;topK=8",
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.reranking.version,
    "none/v1",
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.contextPacking.version,
    "token-role-document-diversity-v1;tokenBudget=6000;maxPerDocument=2;topK=8",
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.verifier.version,
    "claim-span-verifier-v5-extractive-recovery",
  );
  assert.match(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.prompt.version,
    /^press-agent-prompt\/sha256:[a-f0-9]{64}$/,
  );
  assert.match(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.toolset.version,
    /^press-agent-tools\/sha256:[a-f0-9]{64}$/,
  );
  assert.equal(
    CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity.runtimePolicy.version,
    "press-runtime/v2",
  );
});

test("controlled-live baseline, ablations, and candidate have executable distinct identities", async () => {
  const ids = [
    "baseline-v1",
    "rewrite-ablation-v1",
    "reranker-ablation-v1",
    "candidate-v1",
    "candidate-v2",
    "candidate-v3",
  ] as const;
  const hashes = new Set<string>();
  for (const configurationId of ids) {
    const checked = await readJson(
      `evals/press-rag/controlled-live/configurations/${configurationId}.json`,
    );
    const runtime = resolvePressRagControlledLiveConfigurationIdentity(configurationId);
    assert.equal(checked.configurationId, configurationId);
    assert.equal(checked.id, runtime.id);
    assert.equal(checked.contentHash, runtime.contentHash);
    assert.deepEqual(checked.identity, runtime.identity);
    hashes.add(runtime.contentHash);
  }
  assert.equal(hashes.size, 6);
});

test("optimized candidate keeps role-aware chunks while removing measured model-stage latency", () => {
  const configuration = resolvePressKnowledgeRetrievalConfiguration("candidate-v2");
  assert.equal(configuration.chunkProfileMode, "ROLE_AWARE_CANDIDATE");
  assert.equal(configuration.queryTransformation, "DETERMINISTIC_NORMALIZATION");
  assert.equal(configuration.reranker, "NONE");
  assert.equal(
    resolvePressRagControlledLiveConfigurationIdentity("candidate-v3").identity
      .runtimePolicy.version,
    "press-runtime/v2;agentDocumentFilter=opaque-id-v1;exactIdTopK=v1",
  );
});

test("identifier-aware candidate narrows explicit IDs without adding model latency", () => {
  const configuration = resolvePressKnowledgeRetrievalConfiguration("candidate-v3");
  assert.equal(configuration.chunkProfileMode, "ROLE_AWARE_CANDIDATE");
  assert.equal(configuration.queryTransformation, "IDENTIFIER_AWARE_NORMALIZATION");
  assert.equal(configuration.reranker, "NONE");
});

test("runtime identity mirrors the scheduler chunk profile mode", () => {
  assert.equal(
    buildCurrentPressRagRuntimeIdentity({ chunkProfileMode: undefined }).chunking
      .version,
    "page-char-v1;targetChars=1400;overlapChars=200",
  );
  assert.equal(
    buildCurrentPressRagRuntimeIdentity({
      chunkProfileMode: "ROLE_AWARE_CANDIDATE",
    }).chunking.version,
    "role-aware-candidate-v1;FACT=press-fact-semantic-v1;CAREER=career-semantic-v1;STYLE_POLICY=style-policy-semantic-v1;STYLE_EXAMPLE=style-example-semantic-v1",
  );
});

test("unsupported semantic chunk and domain reranker claims are rejected", () => {
  assert.throws(
    () =>
      assertSupportedPressRagRuntimeIdentity({
        ...CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity,
        chunking: { version: "semantic-chunks/v1" },
      }),
    /UNSUPPORTED_PRESS_RAG_RUNTIME_IDENTITY:chunking/,
  );
  assert.throws(
    () =>
      assertSupportedPressRagRuntimeIdentity({
        ...CURRENT_PRESS_RAG_RUNTIME_IDENTITY.identity,
        reranking: { version: "rrf-domain/v2" },
      }),
    /UNSUPPORTED_PRESS_RAG_RUNTIME_IDENTITY:reranking/,
  );
});

test("checked deterministic configurations disclose that product stages were not executed", async () => {
  for (const relativePath of [
    "evals/press-rag/configurations/baseline-v1.json",
    "evals/press-rag/configurations/candidate-v2.json",
  ]) {
    const configuration = await readJson(relativePath);
    assert.doesNotThrow(() => assertDeterministicReplayConfiguration(configuration));
    for (const dimension of [
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
    ] as const) {
      assert.match(
        configuration.identity[dimension].version,
        /^not-executed\/deterministic-replay-v1$/,
        `${relativePath}:${dimension}`,
      );
    }
    assert.match(
      configuration.identity.evaluator.version,
      /^press-rag-deterministic\/(baseline|candidate)-v1$/,
    );
  }
});
