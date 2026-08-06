import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESS_AI_PROCESS_IDS,
  getPressAiProcessDefinition,
  pressCreationProcess,
  ragQueryProcess,
} from "./processRegistry";

test("registry exposes two distinct, versioned process definitions", () => {
  assert.deepEqual(PRESS_AI_PROCESS_IDS, ["rag-query", "press-creation"]);
  assert.equal(getPressAiProcessDefinition("rag-query"), ragQueryProcess);
  assert.equal(getPressAiProcessDefinition("press-creation"), pressCreationProcess);
  assert.notEqual(ragQueryProcess.version, "");
  assert.notEqual(pressCreationProcess.version, "");
});

test("every process has unique node and edge identities with valid topology", () => {
  for (const process of [ragQueryProcess, pressCreationProcess]) {
    const nodeIds = process.nodes.map((node) => node.id);
    const edgeIds = process.edges.map((edge) => edge.id);
    assert.equal(new Set(nodeIds).size, nodeIds.length);
    assert.equal(new Set(edgeIds).size, edgeIds.length);
    for (const edge of process.edges) {
      assert.ok(nodeIds.includes(edge.source));
      assert.ok(nodeIds.includes(edge.target));
    }
  }
});

test("Press creation declares the three real confirmation gates", () => {
  assert.deepEqual(
    pressCreationProcess.nodes.filter((node) => node.gate).map((node) => node.id),
    ["brief-normalization", "draft-generation", "draft-review"],
  );
});

