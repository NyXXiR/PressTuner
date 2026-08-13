import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256Canonical } from "./canonicalJson";
import { buildProcessDefinition, buildProjectManifest, memoSourcePolicyReference } from "./publication";

test("canonical JSON is deterministic and definition hash excludes its self field", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  const definition = buildProcessDefinition();
  const base = Object.fromEntries(Object.entries(definition).filter(([key]) => key !== "canonicalSha256"));
  assert.equal(definition.canonicalSha256, sha256Canonical(base));
  assert.equal(buildProjectManifest(definition).processes[0].definition.sha256, definition.canonicalSha256);
});

test("publication exactly reflects the five-node registry topology and evidence policy", () => {
  const definition = buildProcessDefinition();
  assert.deepEqual(definition.nodes.map(({ nodeId, kind }) => [nodeId, kind]), [
    ["article-initialization", "ACTION"], ["brief-normalization", "HUMAN_GATE"], ["draft-generation", "HUMAN_GATE"], ["draft-review", "HUMAN_GATE"], ["selected-rewrite", "TERMINAL"],
  ]);
  assert.deepEqual(definition.transitions.map(({ sourceNodeId, targetNodeId }) => [sourceNodeId, targetNodeId]), [
    ["article-initialization", "brief-normalization"], ["brief-normalization", "draft-generation"], ["draft-generation", "draft-review"], ["draft-review", "selected-rewrite"],
  ]);
  assert.deepEqual(definition.nodes[1].evidencePolicy, { kind: "SOURCE_BOUND", sourceSetRef: memoSourcePolicyReference });
  assert.deepEqual(definition.nodes[2].evidencePolicy, { kind: "EXTERNAL_VERIFICATION", verifierRef: "presstuner:verifier:evidence-fact-consistency:v1" });
  assert.equal(definition.nodes.some((node) => node.kind === "DECISION"), false);
});
