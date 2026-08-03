import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  identifyAgentConfiguration,
} from "./configurationIdentity";

const identity = {
  model: { version: "model/v1" },
  prompt: { version: "prompt/v1" },
  embedding: { version: "embedding/v1" },
  chunking: { version: "chunking/v1" },
  retrieval: { version: "retrieval/v1" },
  reranking: { version: "reranking/v1" },
  toolset: { version: "toolset/v1" },
  runtimePolicy: { version: "runtime/v1" },
  evaluator: { version: "evaluator/v1" },
};

test("configuration identity is canonical and changes for every dimension", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const baseline = identifyAgentConfiguration(identity);
  for (const key of Object.keys(identity) as Array<keyof typeof identity>) {
    const changed = identifyAgentConfiguration({
      ...identity,
      [key]: { version: `${key}/v2` },
    });
    assert.notEqual(changed.id, baseline.id, key);
  }
});

test("configuration identity rejects missing and unknown dimensions", () => {
  assert.throws(
    () => identifyAgentConfiguration({ ...identity, surprise: true }),
    /unrecognized/i,
  );
  const missing: Record<string, unknown> = { ...identity };
  delete missing.evaluator;
  assert.throws(() => identifyAgentConfiguration(missing));
});
