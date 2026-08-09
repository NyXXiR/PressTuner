import assert from "node:assert/strict";
import test from "node:test";
import { pressCreationProcess, ragQueryProcess } from "./processRegistry";
import { getProcessRegistryHash } from "./processRegistryHash";

test("registry identity is deterministic and execution-sensitive", () => {
  assert.equal(getProcessRegistryHash(pressCreationProcess), getProcessRegistryHash(pressCreationProcess));
  assert.notEqual(getProcessRegistryHash(pressCreationProcess), getProcessRegistryHash({ ...pressCreationProcess, version: "2.0.1" }));
  assert.equal(ragQueryProcess.version, "1.0.0");
});

test("registry topology is ordered, connected, and data-owned", () => {
  const ids = new Set(pressCreationProcess.nodes.map((node) => node.id));
  assert.deepEqual(pressCreationProcess.nodes.map((node) => node.sequence), [0, 1, 2, 3, 4]);
  assert.deepEqual(pressCreationProcess.edges.map((edge) => edge.sequence), [0, 1, 2, 3, 4]);
  for (const node of pressCreationProcess.nodes) assert.ok(node.operationKey);
  for (const edge of pressCreationProcess.edges) { assert.ok(ids.has(edge.source)); assert.ok(ids.has(edge.target)); assert.ok(edge.payload.length); assert.ok(edge.mandatoryGuardrailIds.length); }
});
