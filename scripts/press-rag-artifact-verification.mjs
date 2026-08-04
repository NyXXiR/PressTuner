import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
];
const NOT_EXECUTED_VERSION = "not-executed/deterministic-replay-v1";

function sortForCanonicalJson(value) {
  if (Array.isArray(value)) return value.map(sortForCanonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortForCanonicalJson(child)]),
    );
  }
  return value;
}

function sha256Canonical(value) {
  return createHash("sha256")
    .update(JSON.stringify(sortForCanonicalJson(value)))
    .digest("hex");
}

function requireVersion(identity, dimension) {
  const version = identity?.[dimension]?.version;
  if (typeof version !== "string" || !version) {
    throw new Error(`INVALID_AGENT_CONFIGURATION_DIMENSION:${dimension}`);
  }
  return version;
}

export function verifyDeterministicReplayConfiguration(configuration) {
  if (!configuration || typeof configuration !== "object") {
    throw new Error("INVALID_DETERMINISTIC_REPLAY_CONFIGURATION");
  }
  const identity = configuration.identity;
  for (const dimension of [...PRODUCT_DIMENSIONS, "evaluator"]) {
    requireVersion(identity, dimension);
  }
  for (const dimension of PRODUCT_DIMENSIONS) {
    if (identity[dimension].version !== NOT_EXECUTED_VERSION) {
      throw new Error(
        `DETERMINISTIC_REPLAY_PRODUCT_STAGE_MUST_BE_NOT_EXECUTED:${dimension}`,
      );
    }
  }
  if (
    !/^press-rag-deterministic\/(baseline|candidate)-v1$/.test(
      identity.evaluator.version,
    )
  ) {
    throw new Error("INVALID_DETERMINISTIC_REPLAY_EVALUATOR");
  }
  const contentHash = sha256Canonical(identity);
  if (
    configuration.contentHash !== contentHash ||
    configuration.id !== `cfg_${contentHash}`
  ) {
    throw new Error("DETERMINISTIC_REPLAY_CONFIGURATION_HASH_MISMATCH");
  }
  return { id: configuration.id, contentHash, identity };
}

export function verifyControlledLiveConfiguration(configuration) {
  if (
    configuration?.version !== "press-rag-controlled-live-configuration/v1" ||
    !/^(baseline|rewrite-ablation|reranker-ablation|candidate)-v1$/.test(
      configuration?.configurationId ?? "",
    )
  ) throw new Error("INVALID_CONTROLLED_LIVE_CONFIGURATION");
  for (const dimension of [...PRODUCT_DIMENSIONS, "evaluator"]) {
    requireVersion(configuration.identity, dimension);
  }
  const contentHash = sha256Canonical(configuration.identity);
  if (configuration.contentHash !== contentHash || configuration.id !== `cfg_${contentHash}`) {
    throw new Error(`CONTROLLED_LIVE_CONFIGURATION_HASH_MISMATCH:${configuration.configurationId}`);
  }
  if (configuration.identity.evaluator.version !== "not-measured/current-product-runtime-v1") {
    throw new Error("CONTROLLED_LIVE_CONFIGURATION_EVALUATOR_INVALID");
  }
  return configuration;
}

function collectConfigurationObjects(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((child) => collectConfigurationObjects(child, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  if (
    typeof value.id === "string" &&
    value.id.startsWith("cfg_") &&
    typeof value.contentHash === "string" &&
    value.identity
  ) {
    found.push(value);
  }
  Object.values(value).forEach((child) => collectConfigurationObjects(child, found));
  return found;
}

export async function verifyPressRagArtifacts({ root }) {
  const improvementDirectory = path.join(root, "evals/press-rag/improvement");
  const manifest = JSON.parse(
    await readFile(path.join(improvementDirectory, "manifest.json"), "utf8"),
  );
  for (const [name, expected] of Object.entries(manifest.files ?? {})) {
    if (!/^[a-z0-9-]+\.json$/.test(name) || name === "manifest.json") {
      throw new Error(`INVALID_ARTIFACT_NAME:${name}`);
    }
    const artifactPath = path.join(improvementDirectory, name);
    const bytes = await readFile(artifactPath);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) {
      throw new Error(`PRESS_RAG_ARTIFACT_HASH_MISMATCH:${name}`);
    }
    if (name === "press-rag-execution-evidence-v1.json") {
      const artifact = JSON.parse(bytes.toString("utf8"));
      if (artifact.schemaVersion !== "press-rag/execution-evidence/v1" || artifact.pipeline?.stages?.length !== 7 || !Array.isArray(artifact.runs) || artifact.runs.length === 0) {
        throw new Error("PRESS_RAG_EXECUTION_EVIDENCE_INVALID");
      }
    }
  }

  const configurationPaths = [
    "evals/press-rag/configurations/baseline-v1.json",
    "evals/press-rag/configurations/candidate-v2.json",
  ];
  const configurations = [];
  for (const relativePath of configurationPaths) {
    const configuration = JSON.parse(
      await readFile(path.join(root, relativePath), "utf8"),
    );
    configurations.push(verifyDeterministicReplayConfiguration(configuration));
  }
  for (const name of [
    "baseline-v1",
    "rewrite-ablation-v1",
    "reranker-ablation-v1",
    "candidate-v1",
  ]) {
    const configuration = JSON.parse(
      await readFile(
        path.join(root, `evals/press-rag/controlled-live/configurations/${name}.json`),
        "utf8",
      ),
    );
    configurations.push(verifyControlledLiveConfiguration(configuration));
  }
  const questions = JSON.parse(
    await readFile(path.join(root, "evals/press-rag/interview/questions.ko.json"), "utf8"),
  );
  if (
    questions.version !== "press-rag-interview-questions-ko/v1" ||
    questions.detailed?.length !== 70 ||
    questions.priority?.length !== 10
  ) throw new Error("PRESS_RAG_INTERVIEW_QUESTION_CATALOG_INVALID");

  const cycle = JSON.parse(
    await readFile(
      path.join(improvementDirectory, "deterministic-experiment-cycle-v2.json"),
      "utf8",
    ),
  );
  const embeddedConfigurations = collectConfigurationObjects(cycle);
  if (embeddedConfigurations.length !== 2) {
    throw new Error(
      `DETERMINISTIC_REPLAY_CONFIGURATION_COUNT_MISMATCH:${embeddedConfigurations.length}`,
    );
  }
  embeddedConfigurations.forEach(verifyDeterministicReplayConfiguration);
  const checkedIds = new Set(configurations.slice(0, 2).map((entry) => entry.id));
  if (embeddedConfigurations.some((entry) => !checkedIds.has(entry.id))) {
    throw new Error("DETERMINISTIC_REPLAY_EMBEDDED_CONFIGURATION_MISMATCH");
  }

  return {
    verifiedArtifactCount: Object.keys(manifest.files ?? {}).length,
    verifiedConfigurationCount: configurations.length,
  };
}
