import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  verifyDeterministicReplayConfiguration,
  verifyPressRagArtifacts,
} from "./press-rag-artifact-verification.mjs";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

test("artifact semantics reject unsupported runtime capability labels", async () => {
  const configuration = await readJson(
    "evals/press-rag/configurations/baseline-v1.json",
  );
  const unsupported = {
    ...configuration,
    identity: {
      ...configuration.identity,
      chunking: { version: "semantic-chunks/v1" },
    },
  };

  assert.throws(
    () => verifyDeterministicReplayConfiguration(unsupported),
    /DETERMINISTIC_REPLAY_PRODUCT_STAGE_MUST_BE_NOT_EXECUTED:chunking/,
  );
});

test("checked Press RAG artifacts pass hash and semantic verification", async () => {
  const result = await verifyPressRagArtifacts({ root: process.cwd() });
  assert.ok(result.verifiedArtifactCount > 0);
  assert.equal(result.verifiedConfigurationCount, 2);
});
