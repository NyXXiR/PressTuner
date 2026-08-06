import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parsePressTransitionCiDataset } from "./pressTransitionCiContracts";

test("versioned transition dataset validates content identity and unique cases", () => {
  const dataset = JSON.parse(readFileSync("evals/press-ai-debugger/v1/dataset.json", "utf8")); assert.equal(parsePressTransitionCiDataset(dataset).version, "v1");
  assert.throws(() => parsePressTransitionCiDataset({ ...dataset, contentHash: "0".repeat(64) }));
  assert.throws(() => parsePressTransitionCiDataset({ ...dataset, contentHash: dataset.contentHash, cases: [dataset.cases[0], dataset.cases[0]] }));
});
