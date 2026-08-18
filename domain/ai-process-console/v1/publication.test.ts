import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256Canonical } from "./canonicalJson";
import { buildProcessDefinition, buildProjectManifest, buildRagQueryProcessDefinition, memoSourcePolicyReference, publishedArtifacts } from "./publication";

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

test("publication includes the frozen rag-query registry topology without changing fixture declarations", () => {
  const definition = buildRagQueryProcessDefinition();
  assert.equal(definition.processId, "rag-query");
  assert.equal(definition.version, "1.0.0");
  assert.deepEqual(definition.nodes.map(({ nodeId, kind }) => [nodeId, kind]), [
    ["request-intake", "ACTION"], ["retrieval-execution", "ACTION"], ["evidence-decision", "DECISION"], ["response-behavior", "ACTION"], ["verification", "DECISION"], ["fallback", "ACTION"], ["terminal-evaluation", "TERMINAL"],
  ]);
  assert.deepEqual(definition.transitions.map(({ transitionId, sourceNodeId, targetNodeId }) => [transitionId, sourceNodeId, targetNodeId]), [
    ["request-retrieval", "request-intake", "retrieval-execution"],
    ["retrieval-evidence", "retrieval-execution", "evidence-decision"],
    ["evidence-response", "evidence-decision", "response-behavior"],
    ["response-verification", "response-behavior", "verification"],
    ["verification-terminal", "verification", "terminal-evaluation"],
    ["verification-fallback", "verification", "fallback"],
    ["fallback-terminal", "fallback", "terminal-evaluation"],
  ]);
  assert.deepEqual(buildProjectManifest().processes.map(({ processId, version }) => [processId, version]), [["press-creation", "2.1.0"], ["press-creation", "3.0.0"], ["rag-query", "1.0.0"]]);
  assert.ok("integrations/ai-process-console/v1/rag-query-1.0.0.definition.json" in publishedArtifacts());
  assert.ok("evals/ai-process-console/press-creation/2.1.0/success-v1.json" in publishedArtifacts());
  const bundle = publishedArtifacts()["integrations/ai-process-console/registration-bundle.json"] as { definitions: { schemaVersion: string; processId: string; version: string }[]; testFixtures: { declarationId: string; fixture: unknown }[] };
  assert.deepEqual(bundle.definitions.map(({ schemaVersion, processId, version }) => [schemaVersion, processId, version]), [["1.0", "press-creation", "2.1.0"], ["2.0", "press-creation", "3.0.0"], ["1.0", "rag-query", "1.0.0"]]);
  assert.deepEqual(bundle.testFixtures.map(({ declarationId }) => declarationId), ["success-v1", "success-v2", "final-quality-block-v2"]);
  assert.equal(JSON.stringify(bundle).includes("memoText"), false);
});
